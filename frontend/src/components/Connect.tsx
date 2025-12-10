let socket: WebSocket | null = null;

export function initSocket(url: string) {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    socket = new WebSocket(url);

    socket.onopen = () => console.log("WebSocket connected");
    socket.onmessage = (event) => console.log("Message from backend:", event.data);
    socket.onclose = () => console.log("WebSocket closed");
    socket.onerror = (err) => console.error("WebSocket error", err);
  }

  return socket;
}

export function getSocket() {
  return socket;
}

