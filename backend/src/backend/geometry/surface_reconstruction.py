from __future__ import annotations

from collections import deque

import numpy as np


def _require_scipy():
    try:
        from scipy.ndimage import binary_closing
        from scipy.spatial import cKDTree
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Surface reconstruction requires scipy. Install the backend surface-processing dependencies."
        ) from exc
    return cKDTree, binary_closing


def _neighbors6():
    return [
        (1, 0, 0),
        (-1, 0, 0),
        (0, 1, 0),
        (0, -1, 0),
        (0, 0, 1),
        (0, 0, -1),
    ]


def build_field_from_points(
    points: np.ndarray,
    voxel_size: float,
    sigma: float,
    padding: float,
    *,
    status_cb=None,
):
    cKDTree, _binary_closing = _require_scipy()

    pts = np.asarray(points, dtype=np.float32)
    pmin = pts.min(axis=0) - np.array([padding, padding, padding], dtype=np.float32)
    pmax = pts.max(axis=0) + np.array([padding, padding, padding], dtype=np.float32)

    dims = np.ceil((pmax - pmin) / voxel_size).astype(int) + 1
    nx, ny, nz = int(dims[0]), int(dims[1]), int(dims[2])
    if nx <= 2 or ny <= 2 or nz <= 2:
        raise ValueError(f"Grid too small: dims={dims}. Increase padding or decrease voxel_size.")
    if sigma <= 0:
        raise ValueError("sigma must be > 0")

    tree = cKDTree(pts)
    xs = pmin[0] + np.arange(nx, dtype=np.float32) * voxel_size
    ys = pmin[1] + np.arange(ny, dtype=np.float32) * voxel_size
    zs = pmin[2] + np.arange(nz, dtype=np.float32) * voxel_size

    field = np.empty((nx, ny, nz), dtype=np.float32)
    y_grid, z_grid = np.meshgrid(ys, zs, indexing="ij")
    yz = np.stack([y_grid.reshape(-1), z_grid.reshape(-1)], axis=1)
    progress_step = max(1, nx // 20)

    for ix in range(nx):
        x_col = np.full((yz.shape[0], 1), xs[ix], dtype=np.float32)
        slab = np.concatenate([x_col, yz], axis=1)
        dists, _ = tree.query(slab, k=1, workers=-1)
        field[ix, :, :] = np.exp(-((dists / sigma) ** 2)).astype(np.float32).reshape(ny, nz)
        if status_cb and ((ix + 1) % progress_step == 0 or (ix + 1) == nx):
            status_cb("field_progress", f"{ix + 1}/{nx}")

    return field, pmin, (nx, ny, nz)


def flood_fill_outside_air(air: np.ndarray) -> np.ndarray:
    nx, ny, nz = air.shape
    outside = np.zeros_like(air, dtype=bool)
    queue: deque[tuple[int, int, int]] = deque()

    def push_if_air(i: int, j: int, k: int) -> None:
        if air[i, j, k] and not outside[i, j, k]:
            outside[i, j, k] = True
            queue.append((i, j, k))

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

    while queue:
        x, y, z = queue.popleft()
        for dx, dy, dz in _neighbors6():
            xx, yy, zz = x + dx, y + dy, z + dz
            if 0 <= xx < nx and 0 <= yy < ny and 0 <= zz < nz:
                if air[xx, yy, zz] and not outside[xx, yy, zz]:
                    outside[xx, yy, zz] = True
                    queue.append((xx, yy, zz))

    return outside


def voxel_shell_of_solid_adjacent_to(solid: np.ndarray, adjacent_to: np.ndarray) -> np.ndarray:
    shell = np.zeros_like(solid, dtype=bool)
    nx, ny, nz = solid.shape

    for x, y, z in np.argwhere(solid):
        for dx, dy, dz in _neighbors6():
            xx, yy, zz = x + dx, y + dy, z + dz
            if 0 <= xx < nx and 0 <= yy < ny and 0 <= zz < nz and adjacent_to[xx, yy, zz]:
                shell[x, y, z] = True
                break
    return shell


def voxel_centers_from_mask(mask: np.ndarray, origin: np.ndarray, voxel_size: float) -> np.ndarray:
    idx = np.argwhere(mask)
    if idx.size == 0:
        return np.empty((0, 3), dtype=np.float32)
    return origin[None, :] + (idx.astype(np.float32) + 0.5) * float(voxel_size)


def map_shell_voxels_to_original_points(
    *,
    shell_mask: np.ndarray,
    origin: np.ndarray,
    voxel_size: float,
    original_points: np.ndarray,
    mode: str = "nn",
    radius: float | None = None,
    status_cb=None,
) -> np.ndarray:
    cKDTree, _binary_closing = _require_scipy()

    centers = voxel_centers_from_mask(shell_mask, origin, voxel_size)
    if centers.shape[0] == 0:
        return np.empty((0, 3), dtype=np.float32)

    pts = np.asarray(original_points, dtype=np.float32)
    tree = cKDTree(pts)

    if mode == "nn":
        if status_cb:
            status_cb("map_nn_start", f"shell_voxels={centers.shape[0]}")
        _, idx = tree.query(centers, k=1, workers=-1)
        mapped = np.unique(pts[idx], axis=0).astype(np.float32)
        if status_cb:
            status_cb("map_nn_done", f"unique={mapped.shape[0]}")
        return mapped

    if mode == "radius":
        actual_radius = float(radius if radius is not None else (1.25 * voxel_size))
        if status_cb:
            status_cb("map_radius_start", f"shell_voxels={centers.shape[0]} r={actual_radius:.6f}")
        idx_lists = tree.query_ball_point(centers, r=actual_radius, workers=-1)
        all_idx = np.fromiter((i for idx_list in idx_lists for i in idx_list), dtype=np.int64)
        if all_idx.size == 0:
            return np.empty((0, 3), dtype=np.float32)
        mapped = pts[np.unique(all_idx)].astype(np.float32)
        if status_cb:
            status_cb("map_radius_done", f"unique={mapped.shape[0]}")
        return mapped

    raise ValueError(f"Unknown mode={mode!r}. Use 'nn' or 'radius'.")


def compute_surface_points_from_xyz(
    points_xyz: np.ndarray,
    *,
    voxel_size: float = 0.01,
    sigma: float = 0.02,
    iso_level: float = 0.30,
    padding: float = 0.05,
    closing_radius: int = 0,
    min_points: int = 200,
    status_cb=None,
    map_mode: str = "nn",
    map_radius: float | None = None,
) -> np.ndarray:
    _cKDTree, binary_closing = _require_scipy()

    pts = np.asarray(points_xyz, dtype=np.float32)
    if pts.ndim != 2 or pts.shape[1] != 3:
        raise ValueError(f"points_xyz must be (N,3), got {pts.shape}")
    if pts.shape[0] < min_points:
        raise ValueError(f"Too few points ({pts.shape[0]}). Need at least {min_points}.")

    if status_cb:
        status_cb("build_field_start")
    field, origin, _dims = build_field_from_points(
        pts,
        voxel_size,
        sigma,
        padding,
        status_cb=status_cb,
    )
    if status_cb:
        status_cb("build_field_done")

    solid = field >= float(iso_level)
    if closing_radius and int(closing_radius) > 0:
        cr = int(closing_radius)
        if status_cb:
            status_cb("closing_start", f"r={cr}")
        structure = np.ones((2 * cr + 1, 2 * cr + 1, 2 * cr + 1), dtype=bool)
        solid = binary_closing(solid.astype(bool, copy=False), structure=structure)
        if status_cb:
            status_cb("closing_done")
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
