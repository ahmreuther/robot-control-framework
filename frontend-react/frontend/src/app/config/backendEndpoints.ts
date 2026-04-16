const DEFAULT_WEBSOCKET_URL = 'ws://127.0.0.1:8000/ws';

export const WEBSOCKET_URL =
  (import.meta as any)?.env?.VITE_WEBSOCKET_URL ?? DEFAULT_WEBSOCKET_URL;

function deriveRestBaseFromWebSocketUrl(wsUrl: string): string {
  // ws://host:port/ws -> http://host:port
  // wss://host:port/ws -> https://host:port
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
}

export const REST_BACKEND_BASE =
  (import.meta as any)?.env?.VITE_REST_BACKEND_BASE ?? deriveRestBaseFromWebSocketUrl(WEBSOCKET_URL);
