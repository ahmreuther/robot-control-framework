import { WRITER_ID } from '../../robot-control/hooks/useJointState';
import { parseIncomingMessage, tryParseJson } from '../parser/parser';
import type {
  AnglesPayload,
  ParsedIncomingMessage,
  RobotInfoPayload,
  WebSocketHandlerContext,
  WebSocketHandlerResult,
} from '../model/types';

const DEGREE_UNIT = 'C81';

function buildAxisToJointMap(axisNames: string[], urdfJointNames: string[]) {
  const sortedAxis = [...axisNames].sort((a, b) => {
    const ai = parseInt(a.match(/(\d+)$/)?.[1] || '0', 10);
    const bi = parseInt(b.match(/(\d+)$/)?.[1] || '0', 10);
    return ai - bi;
  });

  const n = Math.min(sortedAxis.length, urdfJointNames.length);
  const map: Record<string, string> = {};

  for (let i = 0; i < n; i += 1) {
    const axisName = sortedAxis[i];
    const jointName = urdfJointNames[i];
    if (!axisName || !jointName) continue;
    map[axisName] = jointName;
  }

  return map;
}

function startsWithAny(message: string, prefixes: string[]) {
  return prefixes.some((prefix) => message.startsWith(prefix));
}

function parseConnectionModelAndSerial(msg: string) {
  const lines = msg.split(/\r?\n/);
  const modelLine = lines.find((line) => line.startsWith('Model:'));
  const serialLine = lines.find((line) => line.startsWith('Serial Number:'));

  const model = modelLine ? modelLine.replace('Model:', '').trim() : 'unknown model';
  const serial = serialLine ? serialLine.replace('Serial Number:', '').trim() : 'unknown serial';

  return { model, serial };
}

function handlePrefixedMessage(
  parsed: ParsedIncomingMessage,
  ctx: WebSocketHandlerContext,
): WebSocketHandlerResult {
  if (parsed.kind !== 'prefixed') {
    return { nextLastAxleUiUpdateAt: ctx.lastAxleUiUpdateAt };
  }

  switch (parsed.prefix) {
    case 'custom':
    case 'unsubscribe': {
      return { nextLastAxleUiUpdateAt: ctx.lastAxleUiUpdateAt };
    }

    case 'event': {
      const payload = tryParseJson<unknown>(parsed.payloadRaw);
      if (payload !== null) {
        const timestamp = new Date().toLocaleTimeString();
        ctx.appendLog(`Event [${timestamp}]: ${JSON.stringify(payload)}\n`, ctx.targetServerId);
      }
      return { nextLastAxleUiUpdateAt: ctx.lastAxleUiUpdateAt };
    }

    case 'robotinfo': {
      const payload = tryParseJson<RobotInfoPayload>(parsed.payloadRaw);
      if (payload) {
        ctx.updateTargetState({ robotInfo: payload });

        if (payload.gotoMethodNodeId) {
          ctx.updateTargetState({ gotoMethodNodeId: payload.gotoMethodNodeId });
        }
        if (payload.model) {
          ctx.updateTargetState({ robotName: payload.model });
        }

        ctx.appendLog('Robot info received\n', ctx.targetServerId);
      }
      return { nextLastAxleUiUpdateAt: ctx.lastAxleUiUpdateAt };
    }

    case 'Mode': {
      const mode = parsed.payloadRaw.trim();
      ctx.updateTargetState({ robotMode: mode });
      ctx.appendLog(`Mode: ${mode}\n`, ctx.targetServerId);
      return { nextLastAxleUiUpdateAt: ctx.lastAxleUiUpdateAt };
    }

    case 'angles': {
      const payloadText = parsed.payloadRaw.replace(/'/g, '"');
      const payload = tryParseJson<AnglesPayload>(payloadText);
      if (!payload?.angles) {
        return { nextLastAxleUiUpdateAt: ctx.lastAxleUiUpdateAt };
      }

      const axisNames = Object.keys(payload.angles);
      const opcuaJointLength = Math.min(axisNames.length, ctx.orderedJointNames.length);

      if (ctx.isSyncActive && opcuaJointLength !== ctx.opcuaJointLength) {
        ctx.updateTargetState({ opcuaJointLength });
      }

      let nextLastAxleUiUpdateAt = ctx.lastAxleUiUpdateAt;
      const now = Date.now();
      if (!ctx.isSyncActive || now - ctx.lastAxleUiUpdateAt > 200) {
        ctx.updateTargetState({ axleValues: payload.angles });
        nextLastAxleUiUpdateAt = now;
      }

      if (!ctx.orderedJointNames.length) {
        return { nextLastAxleUiUpdateAt };
      }

      const map = buildAxisToJointMap(axisNames, ctx.orderedJointNames);
      const nextAngles = ctx.orderedJointNames.map(() => 0);

      Object.entries(payload.angles).forEach(([axisName, axisValue]) => {
        const jointName = map[axisName];
        if (!jointName) return;

        const jointIndex = ctx.orderedJointNames.indexOf(jointName);
        if (jointIndex < 0) return;

        let value = Number(axisValue) || 0;
        if (payload.unit && payload.unit !== DEGREE_UNIT) {
          value = (value * Math.PI) / 180;
        }

        nextAngles[jointIndex] = value;
      });

      ctx.jointManager.setAngles(WRITER_ID.SYN, nextAngles);

      return { nextLastAxleUiUpdateAt };
    }

    default: {
      ctx.appendLog(`Warning: Unsupported prefixed message '${parsed.rawPrefix}'.\n`, ctx.targetServerId);
      return { nextLastAxleUiUpdateAt: ctx.lastAxleUiUpdateAt };
    }
  }
}

function handlePlainMessage(msg: string, ctx: WebSocketHandlerContext): WebSocketHandlerResult {
  ctx.appendLog(`Received: ${msg}\n`, ctx.targetServerId);

  if (startsWithAny(msg, ['Connected to ', '✅ Connected to '])) {
    if (ctx.targetServerId !== null) {
      ctx.updateServerConnectionStatus(ctx.targetServerId, true);
    }
    ctx.updateTargetState({ robotStatus: 'Connected' });
  }

  if (msg.startsWith('Model:')) {
    const { model, serial } = parseConnectionModelAndSerial(msg);
    ctx.updateTargetState({
      robotName: `${model}(${serial})`,
      robotStatus: 'Connected',
    });
  }

  if (startsWithAny(msg, ['Disconnected from ', '🔌 Disconnected from ', 'Error: Disconnected from '])) {
    if (ctx.targetServerId !== null) {
      ctx.updateServerConnectionStatus(ctx.targetServerId, false);
    }

    ctx.updateTargetState({
      robotStatus: 'Not Connected',
      robotName: '-',
      robotMode: '-',
      axleValues: {},
      robotInfo: {},
      gotoMethodNodeId: null,
    });

    ctx.setActiveRuntimeServerId(null);
  }

  if (startsWithAny(msg, ['No client found', '❌ No client found', 'Error: No client found'])) {
    if (ctx.targetServerId !== null) {
      ctx.updateServerConnectionStatus(ctx.targetServerId, false);
    }

    ctx.updateTargetState({
      robotStatus: 'Not Connected',
      robotName: '-',
      robotMode: '-',
      gotoMethodNodeId: null,
    });

    ctx.setActiveRuntimeServerId(null);
  }

  if (startsWithAny(msg, ['Connection failed to', '❌ Connection failed to', 'Error: Connection failed to'])) {
    if (ctx.targetServerId !== null) {
      ctx.updateServerConnectionStatus(ctx.targetServerId, false);
    }

    ctx.resetTargetState();
    ctx.setActiveRuntimeServerId(null);
  }

  return { nextLastAxleUiUpdateAt: ctx.lastAxleUiUpdateAt };
}

export function handleIncomingMessage(msg: string, ctx: WebSocketHandlerContext): WebSocketHandlerResult {
  const parsed = parseIncomingMessage(msg);

  if (parsed.kind === 'prefixed') {
    return handlePrefixedMessage(parsed, ctx);
  }

  return handlePlainMessage(msg, ctx);
}
