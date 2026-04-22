import type { ClientMessage, ServerMessage } from './messages';

export type WebSocketClientStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface WebSocketLike {
  readyState: number;
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;
export type ServerMessageListener = (message: ServerMessage) => void;
export type StatusListener = (status: WebSocketClientStatus) => void;
export type WebSocketMessageDirection = 'incoming' | 'outgoing' | 'queued';

export interface WebSocketMessageLogEntry {
  direction: WebSocketMessageDirection;
  message: ClientMessage | ServerMessage;
  timestamp: number;
}

export type MessageLogListener = (entry: WebSocketMessageLogEntry) => void;

const OPEN_READY_STATE = 1;

function defaultWebSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

export class WscWebSocketClient {
  private socket: WebSocketLike | null = null;
  private requestCounter = 0;
  private readonly pendingMessages: ClientMessage[] = [];
  private readonly messageListeners = new Set<ServerMessageListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly messageLogListeners = new Set<MessageLogListener>();
  private status: WebSocketClientStatus = 'idle';

  constructor(
    private readonly url: string,
    private readonly socketFactory: WebSocketFactory = defaultWebSocketFactory,
  ) {}

  getStatus(): WebSocketClientStatus {
    return this.status;
  }

  connect(): void {
    if (this.socket && this.status !== 'closed' && this.status !== 'error') {
      return;
    }

    this.setStatus('connecting');
    const socket = this.socketFactory(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.setStatus('open');
      this.flushPendingMessages();
    };
    socket.onclose = () => this.setStatus('closed');
    socket.onerror = () => this.setStatus('error');
    socket.onmessage = (event) => this.handleRawMessage(event.data);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.pendingMessages.length = 0;
    this.setStatus('closed');
  }

  onMessage(listener: ServerMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onMessageLog(listener: MessageLogListener): () => void {
    this.messageLogListeners.add(listener);
    return () => this.messageLogListeners.delete(listener);
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== OPEN_READY_STATE) {
      throw new Error('WebSocket is not open.');
    }

    this.socket.send(JSON.stringify(message));
    this.emitMessageLog('outgoing', message);
  }

  connectServer(serverUrl: string): string {
    const requestId = this.nextRequestId('connect');
    this.sendOrQueue({ type: 'connectServer', requestId, serverUrl });
    return requestId;
  }

  discoverRobots(serverUrl: string): string {
    const requestId = this.nextRequestId('discover');
    this.sendOrQueue({ type: 'discoverRobots', requestId, serverUrl });
    return requestId;
  }

  disconnectServer(serverUrl: string): string {
    const requestId = this.nextRequestId('disconnect');
    this.sendOrQueue({ type: 'disconnectServer', requestId, serverUrl });
    return requestId;
  }

  subscribeRobotJoints(robotId: string): string {
    const requestId = this.nextRequestId('subscribe-joints');
    this.sendOrQueue({ type: 'subscribeRobotJoints', requestId, robotId });
    return requestId;
  }

  unsubscribeRobotJoints(robotId: string): string {
    const requestId = this.nextRequestId('unsubscribe-joints');
    this.sendOrQueue({ type: 'unsubscribeRobotJoints', requestId, robotId });
    return requestId;
  }

  subscribeRobotMode(robotId: string): string {
    const requestId = this.nextRequestId('subscribe-mode');
    this.sendOrQueue({ type: 'subscribeRobotMode', requestId, robotId });
    return requestId;
  }

  unsubscribeRobotMode(robotId: string): string {
    const requestId = this.nextRequestId('unsubscribe-mode');
    this.sendOrQueue({ type: 'unsubscribeRobotMode', requestId, robotId });
    return requestId;
  }

  callRobotMethod(
    robotId: string,
    method: string,
    inputs: Record<string, unknown> = {},
  ): string {
    const requestId = this.nextRequestId(`method-${method}`);
    this.sendOrQueue({ type: 'callRobotMethod', requestId, robotId, method, inputs });
    return requestId;
  }

  subscribeNode(serverUrl: string, nodeId: string): string {
    const requestId = this.nextRequestId('subscribe-node');
    this.sendOrQueue({ type: 'subscribeNode', requestId, serverUrl, nodeId });
    return requestId;
  }

  unsubscribeNode(serverUrl: string, nodeId: string): string {
    const requestId = this.nextRequestId('unsubscribe-node');
    this.sendOrQueue({ type: 'unsubscribeNode', requestId, serverUrl, nodeId });
    return requestId;
  }

  subscribeEvent(serverUrl: string, nodeId: string): string {
    const requestId = this.nextRequestId('subscribe-event');
    this.sendOrQueue({ type: 'subscribeEvent', requestId, serverUrl, nodeId });
    return requestId;
  }

  unsubscribeEvent(serverUrl: string, nodeId: string): string {
    const requestId = this.nextRequestId('unsubscribe-event');
    this.sendOrQueue({ type: 'unsubscribeEvent', requestId, serverUrl, nodeId });
    return requestId;
  }

  callRawMethod(
    serverUrl: string,
    nodeId: string,
    inputs: Record<string, unknown> = {},
  ): string {
    const requestId = this.nextRequestId('raw-method');
    this.sendOrQueue({ type: 'callRawMethod', requestId, serverUrl, nodeId, inputs });
    return requestId;
  }

  private sendOrQueue(message: ClientMessage): void {
    if (this.socket?.readyState === OPEN_READY_STATE) {
      this.send(message);
      return;
    }

    this.pendingMessages.push(message);
    this.emitMessageLog('queued', message);
    if (!this.socket || this.status === 'closed' || this.status === 'error') {
      this.connect();
    }
  }

  private flushPendingMessages(): void {
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  private nextRequestId(prefix: string): string {
    this.requestCounter += 1;
    return `${prefix}-${this.requestCounter}`;
  }

  private handleRawMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }

    const message = JSON.parse(raw) as ServerMessage;
    this.emitMessageLog('incoming', message);
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  private emitMessageLog(
    direction: WebSocketMessageDirection,
    message: ClientMessage | ServerMessage,
  ): void {
    const entry: WebSocketMessageLogEntry = {
      direction,
      message,
      timestamp: Date.now(),
    };
    for (const listener of this.messageLogListeners) {
      listener(entry);
    }
  }

  private setStatus(status: WebSocketClientStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
