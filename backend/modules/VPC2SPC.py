# surface_points.py
# -*- coding: utf-8 -*-
"""
Compute outer surface contour points from an input point cloud, but return ORIGINAL
point cloud samples mapped from the detected voxel shell (avoids "inflated" voxel-center surface).

Pipeline:
Pointcloud -> implicit occupancy-like field (Gaussian of NN distance) -> threshold (iso)
-> flood fill outside air -> outer shell voxels
-> map shell voxel centers back to ORIGINAL points (NN or radius union)
-> return mapped points (subset of original) as surface points

Dependencies:
  pip install open3d numpy scipy
"""

from __future__ import annotations

import os
import numpy as np
import open3d as o3d
from scipy.spatial import cKDTree


# ------------------------------------------------------------
# Public API: array-based (WebSocket)
# ------------------------------------------------------------
def compute_outer_surface_points_from_xyz(
    points_xyz: np.ndarray,
    voxel_size: float = 0.01,
    sigma: float = 0.02,
    iso_level: float = 0.30,
    padding: float = 0.05,
    min_points: int = 200,
    status_cb=None,
    map_mode: str = "nn",            # "nn" or "radius"
    map_radius: float | None = None  # only used for "radius"
) -> np.ndarray:
    """
    Takes an (N,3) array directly (from WebSocket).
    Returns (M,3) float32 points, but these are ORIGINAL points mapped from the voxel shell.

    map_mode="nn":
        For each shell voxel center, select nearest original point. Then deduplicate.
    map_mode="radius":
        For each shell voxel center, collect all original points within map_radius and union them.
        Default map_radius = 1.25 * voxel_size.
    """
    pts = np.asarray(points_xyz, dtype=np.float32)
    if pts.ndim != 2 or pts.shape[1] != 3:
        raise ValueError(f"points_xyz must be (N,3), got {pts.shape}")
    if pts.shape[0] < min_points:
        raise ValueError(f"Too few points ({pts.shape[0]}). Need at least {min_points}.")

    if status_cb:
        status_cb("build_field_start")
    field, origin, _dims = build_field_from_points(
        pts, voxel_size, sigma, padding, status_cb=status_cb
    )
    if status_cb:
        status_cb("build_field_done")

    solid = field >= float(iso_level)
    air = ~solid

    if status_cb:
        status_cb("flood_fill_start")
    outside_air = flood_fill_outside_air(air)
    if status_cb:
        status_cb("flood_fill_done")

    if status_cb:
        status_cb("shell_start")
    outer_shell = voxel_shell_of_solid_adjacent_to(solid, outside_air)
    if status_cb:
        status_cb("shell_done")

    # --- NEW: map shell voxels -> original points (avoids voxel-center inflation) ---
    if status_cb:
        status_cb("map_to_original_start", f"mode={map_mode}")

    surface_points = map_shell_voxels_to_original_points(
        shell_mask=outer_shell,
        origin=origin,
        voxel_size=voxel_size,
        original_points=pts,
        mode=map_mode,
        radius=map_radius,
        status_cb=status_cb,
    )

    if status_cb:
        status_cb("surface_points_done", f"count={surface_points.shape[0]}")
    return surface_points


# ------------------------------------------------------------
# IO helpers (optional)
# ------------------------------------------------------------
def read_point_cloud(path: str) -> np.ndarray:
    ext = os.path.splitext(path)[1].lower()

    if ext in [".ply", ".pcd", ".xyz", ".xyzn", ".xyzrgb", ".pts"]:
        pcd = o3d.io.read_point_cloud(path)
        if pcd.is_empty():
            raise ValueError(f"Point cloud is empty or could not be read: {path}")
        return np.asarray(pcd.points, dtype=np.float32)

    pts = np.loadtxt(path, dtype=np.float32)
    if pts.ndim != 2 or pts.shape[1] < 3:
        raise ValueError("Text file must contain at least 3 columns (x y z).")
    return pts[:, :3].astype(np.float32)


def points_to_open3d_pcd(points_xyz: np.ndarray) -> o3d.geometry.PointCloud:
    pcd = o3d.geometry.PointCloud()
    if points_xyz.size:
        pcd.points = o3d.utility.Vector3dVector(points_xyz.astype(np.float64))
    return pcd


# ------------------------------------------------------------
# Field construction
# ------------------------------------------------------------
def build_field_from_points(
    points: np.ndarray,
    voxel_size: float,
    sigma: float,
    padding: float,
    status_cb=None
):
    points = points.astype(np.float32)

    pmin = points.min(axis=0)
    pmax = points.max(axis=0)

    pad = np.array([padding, padding, padding], dtype=np.float32)
    pmin = pmin - pad
    pmax = pmax + pad

    dims = np.ceil((pmax - pmin) / voxel_size).astype(int) + 1
    nx, ny, nz = int(dims[0]), int(dims[1]), int(dims[2])

    if nx <= 2 or ny <= 2 or nz <= 2:
        raise ValueError(f"Grid too small: dims={dims}. Increase padding or decrease voxel_size.")
    if sigma <= 0:
        raise ValueError("sigma must be > 0")

    tree = cKDTree(points)

    xs = pmin[0] + np.arange(nx, dtype=np.float32) * voxel_size
    ys = pmin[1] + np.arange(ny, dtype=np.float32) * voxel_size
    zs = pmin[2] + np.arange(nz, dtype=np.float32) * voxel_size

    field = np.empty((nx, ny, nz), dtype=np.float32)

    # Fill slab-by-slab along x
    Y, Z = np.meshgrid(ys, zs, indexing="ij")
    yz = np.stack([Y.reshape(-1), Z.reshape(-1)], axis=1)

    progress_step = max(1, nx // 20)
    for ix in range(nx):
        X = np.full((yz.shape[0], 1), xs[ix], dtype=np.float32)
        slab = np.concatenate([X, yz], axis=1)

        dists, _ = tree.query(slab, k=1, workers=-1)
        vals = np.exp(-((dists / sigma) ** 2)).astype(np.float32)
        field[ix, :, :] = vals.reshape(ny, nz)

        if status_cb and ((ix + 1) % progress_step == 0 or (ix + 1) == nx):
            status_cb("field_progress", f"{ix + 1}/{nx}")

    origin = pmin
    return field, origin, (nx, ny, nz)


# ------------------------------------------------------------
# Voxel contour extraction (outer shell only)
# ------------------------------------------------------------
def _neighbors6():
    return [(1, 0, 0), (-1, 0, 0),
            (0, 1, 0), (0, -1, 0),
            (0, 0, 1), (0, 0, -1)]


def flood_fill_outside_air(air: np.ndarray) -> np.ndarray:
    """
    air: boolean volume where True means air voxel
    returns: outside_air mask (True where reachable air from boundary with 6-connectivity)
    """
    nx, ny, nz = air.shape
    outside = np.zeros_like(air, dtype=bool)

    from collections import deque
    q = deque()

    def push_if_air(i, j, k):
        if air[i, j, k] and not outside[i, j, k]:
            outside[i, j, k] = True
            q.append((i, j, k))

    # boundary faces
    for i in range(nx):
        for j in range(ny):
            push_if_air(i, j, 0)
            push_if_air(i, j, nz - 1)
    for i in range(nx):
        for k in range(nz):
            push_if_air(i, 0, k)
            push_if_air(i, ny - 1, k)
    for j in range(ny):
        for k in range(nz):
            push_if_air(0, j, k)
            push_if_air(nx - 1, j, k)

    n6 = _neighbors6()
    while q:
        x, y, z = q.popleft()
        for dx, dy, dz in n6:
            xx, yy, zz = x + dx, y + dy, z + dz
            if 0 <= xx < nx and 0 <= yy < ny and 0 <= zz < nz:
                if air[xx, yy, zz] and not outside[xx, yy, zz]:
                    outside[xx, yy, zz] = True
                    q.append((xx, yy, zz))

    return outside


def voxel_shell_of_solid_adjacent_to(solid: np.ndarray, adjacent_to: np.ndarray) -> np.ndarray:
    """
    solid: True = solid voxel
    adjacent_to: True = voxel type we want to touch (here: outside air)
    shell: solid voxels that have a 6-neighbor in adjacent_to
    """
    nx, ny, nz = solid.shape
    shell = np.zeros_like(solid, dtype=bool)
    n6 = _neighbors6()

    for (x, y, z) in np.argwhere(solid):
        for dx, dy, dz in n6:
            xx, yy, zz = x + dx, y + dy, z + dz
            if 0 <= xx < nx and 0 <= yy < ny and 0 <= zz < nz:
                if adjacent_to[xx, yy, zz]:
                    shell[x, y, z] = True
                    break
    return shell


def voxel_centers_from_mask(mask: np.ndarray, origin: np.ndarray, voxel_size: float) -> np.ndarray:
    idx = np.argwhere(mask)
    if idx.size == 0:
        return np.empty((0, 3), dtype=np.float32)
    centers = origin[None, :] + (idx.astype(np.float32) + 0.5) * float(voxel_size)
    return centers.astype(np.float32)


# ------------------------------------------------------------
# NEW: map shell voxels -> original points
# ------------------------------------------------------------
def map_shell_voxels_to_original_points(
    shell_mask: np.ndarray,
    origin: np.ndarray,
    voxel_size: float,
    original_points: np.ndarray,
    mode: str = "nn",          # "nn" or "radius"
    radius: float | None = None,
    status_cb=None,
) -> np.ndarray:
    """
    Avoid voxel-center inflation by returning a subset of the ORIGINAL point cloud.

    mode="nn": for each shell voxel center take nearest original point (KDTree query), then deduplicate.
    mode="radius": collect all original points within 'radius' of each voxel center and union them.

    Returns:
        (M,3) float32 points from the original cloud (subset), de-duplicated.
    """
    centers = voxel_centers_from_mask(shell_mask, origin, voxel_size)
    if centers.shape[0] == 0:
        return np.empty((0, 3), dtype=np.float32)

    pts = np.asarray(original_points, dtype=np.float32)
    tree = cKDTree(pts)

    if mode == "nn":
        if status_cb:
            status_cb("map_nn_start", f"shell_voxels={centers.shape[0]}")
        _, idx = tree.query(centers, k=1, workers=-1)
        mapped = pts[idx]
        mapped_unique = np.unique(mapped, axis=0).astype(np.float32)
        if status_cb:
            status_cb("map_nn_done", f"unique={mapped_unique.shape[0]}")
        return mapped_unique

    if mode == "radius":
        if radius is None:
            radius = 1.25 * float(voxel_size)

        if status_cb:
            status_cb("map_radius_start", f"shell_voxels={centers.shape[0]} r={radius:.6f}")

        idx_lists = tree.query_ball_point(centers, r=float(radius), workers=-1)
        if not idx_lists:
            return np.empty((0, 3), dtype=np.float32)

        # flatten lists -> numpy
        all_idx = np.fromiter((i for lst in idx_lists for i in lst), dtype=np.int64, count=-1)
        if all_idx.size == 0:
            return np.empty((0, 3), dtype=np.float32)

        all_idx = np.unique(all_idx)
        mapped_unique = pts[all_idx].astype(np.float32)

        if status_cb:
            status_cb("map_radius_done", f"unique={mapped_unique.shape[0]}")
        return mapped_unique

    raise ValueError(f"Unknown mode='{mode}'. Use 'nn' or 'radius'.")


# ------------------------------------------------------------
# Public API (path-based)
# ------------------------------------------------------------
def compute_outer_surface_points(
    input_path: str,
    voxel_size: float = 0.01,
    sigma: float = 0.02,
    iso_level: float = 0.30,
    padding: float = 0.05,
    min_points: int = 200,
) -> np.ndarray:
    """
    Path-based convenience wrapper.
    Returns ORIGINAL points mapped from voxel shell (subset of original cloud).
    """
    points = read_point_cloud(input_path)
    if points.shape[0] < min_points:
        raise ValueError(f"Too few points ({points.shape[0]}). Need at least {min_points}.")

    field, origin, _dims = build_field_from_points(points, voxel_size, sigma, padding)

    solid = field >= float(iso_level)
    air = ~solid

    outside_air = flood_fill_outside_air(air)
    outer_shell = voxel_shell_of_solid_adjacent_to(solid, outside_air)

    # map shell -> original points (default NN)
    surface_points = map_shell_voxels_to_original_points(
        shell_mask=outer_shell,
        origin=origin,
        voxel_size=voxel_size,
        original_points=points,
        mode="nn",
        radius=None,
    )
    return surface_points
