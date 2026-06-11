const DEFAULT_WS_URL = "ws://127.0.0.1:8000/ws";
const DEFAULT_SURFACE_WS_URL = "ws://127.0.0.1:8000/ws/surface";

function getLocationDerivedWebSocketBaseUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const { host } = window.location;
  if (!host) {
    return null;
  }

  return `${protocol}//${host}/ws`;
}

export function getWebSocketUrl(): string {
  return (
    import.meta.env.VITE_WSC2_WS_URL ??
    getLocationDerivedWebSocketBaseUrl() ??
    DEFAULT_WS_URL
  );
}

export function getSurfaceWebSocketUrl(): string {
  const base = getWebSocketUrl();
  return base.replace(/\/ws\/?$/, "/ws/surface") || DEFAULT_SURFACE_WS_URL;
}
