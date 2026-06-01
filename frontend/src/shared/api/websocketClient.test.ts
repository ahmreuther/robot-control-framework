import { describe, expect, it } from 'vitest';

import { WscWebSocketClient, type WebSocketLike } from './websocketClient';

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(data: unknown): void {
    this.onmessage?.({ data });
  }
}

describe('WscWebSocketClient', () => {
  it('connects and emits status changes', () => {
    const socket = new FakeWebSocket();
    const client = new WscWebSocketClient('ws://backend/ws', () => {
      return socket;
    });
    const statuses: string[] = [];
    client.onStatus((status) => statuses.push(status));

    client.connect();
    socket.open();

    expect(statuses).toEqual(['connecting', 'open']);
    expect(client.getStatus()).toBe('open');
  });

  it('sends typed JSON commands with generated request ids', () => {
    const socket = new FakeWebSocket();
    const client = new WscWebSocketClient('ws://backend/ws', () => {
      return socket;
    });

    client.connect();
    socket.open();
    const requestId = client.discoverRobots('opc.tcp://127.0.0.1:4840');

    expect(requestId).toBe('discover-1');
    expect(socket.sent.map((raw: string) => JSON.parse(raw))).toEqual([
      {
        type: 'discoverRobots',
        requestId: 'discover-1',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
      },
    ]);
  });

  it('sends node, event, mode, and raw method commands', () => {
    const socket = new FakeWebSocket();
    const client = new WscWebSocketClient('ws://backend/ws', () => {
      return socket;
    });

    client.connect();
    socket.open();

    client.subscribeNode('opc.tcp://127.0.0.1:4840', 'ns=4;s=temperature');
    client.unsubscribeNode('opc.tcp://127.0.0.1:4840', 'ns=4;s=temperature');
    client.subscribeEvent('opc.tcp://127.0.0.1:4840', 'ns=4;s=MotionDevice_EVA');
    client.unsubscribeEvent('opc.tcp://127.0.0.1:4840', 'ns=4;s=MotionDevice_EVA');
    client.subscribeRobotMode('robot-a');
    client.unsubscribeRobotMode('robot-a');
    client.browseAddressSpaceRoot('opc.tcp://127.0.0.1:4840');
    client.browseAddressSpaceChildren(
      'opc.tcp://127.0.0.1:4840',
      'ns=4;s=MotionDevice_EVA',
    );
    client.browseAddressSpaceReferences(
      'opc.tcp://127.0.0.1:4840',
      'ns=4;s=MotionDevice_EVA',
    );
    client.browseAddressSpaceNodeDetails(
      'opc.tcp://127.0.0.1:4840',
      'ns=4;s=MotionDevice_EVA',
    );
    client.callRawMethod('opc.tcp://127.0.0.1:4840', 'ns=4;s=Go To', {
      args: ['joint', [0, 0, 0, 0, 0, 0]],
    });

    expect(socket.sent.map((raw: string) => JSON.parse(raw))).toEqual([
      {
        type: 'subscribeNode',
        requestId: 'subscribe-node-1',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
        nodeId: 'ns=4;s=temperature',
      },
      {
        type: 'unsubscribeNode',
        requestId: 'unsubscribe-node-2',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
        nodeId: 'ns=4;s=temperature',
      },
      {
        type: 'subscribeEvent',
        requestId: 'subscribe-event-3',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
        nodeId: 'ns=4;s=MotionDevice_EVA',
      },
      {
        type: 'unsubscribeEvent',
        requestId: 'unsubscribe-event-4',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
        nodeId: 'ns=4;s=MotionDevice_EVA',
      },
      {
        type: 'subscribeRobotMode',
        requestId: 'subscribe-mode-5',
        robotId: 'robot-a',
      },
      {
        type: 'unsubscribeRobotMode',
        requestId: 'unsubscribe-mode-6',
        robotId: 'robot-a',
      },
      {
        type: 'browseAddressSpaceRoot',
        requestId: 'browse-root-7',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
      },
      {
        type: 'browseAddressSpaceChildren',
        requestId: 'browse-children-8',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
        nodeId: 'ns=4;s=MotionDevice_EVA',
      },
      {
        type: 'browseAddressSpaceReferences',
        requestId: 'browse-references-9',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
        nodeId: 'ns=4;s=MotionDevice_EVA',
      },
      {
        type: 'browseAddressSpaceNodeDetails',
        requestId: 'browse-node-details-10',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
        nodeId: 'ns=4;s=MotionDevice_EVA',
      },
      {
        type: 'callRawMethod',
        requestId: 'raw-method-11',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
        nodeId: 'ns=4;s=Go To',
        inputs: {
          args: ['joint', [0, 0, 0, 0, 0, 0]],
        },
      },
    ]);
  });

  it('receives parsed server messages', () => {
    const socket = new FakeWebSocket();
    const client = new WscWebSocketClient('ws://backend/ws', () => {
      return socket;
    });
    const received: string[] = [];
    client.onMessage((message) => received.push(message.type));

    client.connect();
    socket.open();
    socket.receive(
      JSON.stringify({
        type: 'serverDisconnected',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
      }),
    );

    expect(received).toEqual(['serverDisconnected']);
  });

  it('logs queued, outgoing, and incoming websocket messages', () => {
    const socket = new FakeWebSocket();
    const client = new WscWebSocketClient('ws://backend/ws', () => socket);
    const log: string[] = [];
    client.onMessageLog((entry) => {
      log.push(`${entry.direction}:${entry.message.type}`);
    });

    client.connectServer('opc.tcp://127.0.0.1:4840');
    socket.open();
    socket.receive(
      JSON.stringify({
        type: 'serverConnected',
        server: {
          serverUrl: 'opc.tcp://127.0.0.1:4840',
          status: 'connected',
          namespaceUris: [],
          isRoboticsServer: false,
          motionDeviceIds: [],
        },
      }),
    );

    expect(log).toEqual([
      'queued:connectServer',
      'outgoing:connectServer',
      'incoming:serverConnected',
    ]);
  });

  it('queues helper commands until the socket opens', () => {
    const socket = new FakeWebSocket();
    const client = new WscWebSocketClient('ws://backend/ws', () => socket);

    const requestId = client.connectServer('opc.tcp://127.0.0.1:4840');

    expect(requestId).toBe('connect-1');
    expect(client.getStatus()).toBe('connecting');
    expect(socket.sent).toEqual([]);

    socket.open();

    expect(socket.sent.map((raw: string) => JSON.parse(raw))).toEqual([
      {
        type: 'connectServer',
        requestId: 'connect-1',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
      },
    ]);
  });

  it('keeps low-level send strict before the socket is open', () => {
    const client = new WscWebSocketClient('ws://backend/ws', () => new FakeWebSocket());

    let thrownMessage: string | null = null;
    try {
      client.send({
        type: 'connectServer',
        requestId: 'connect-1',
        serverUrl: 'opc.tcp://127.0.0.1:4840',
      });
    } catch (error) {
      thrownMessage = (error as Error).message;
    }
    expect(thrownMessage).toBe('WebSocket is not open.');
  });
});
