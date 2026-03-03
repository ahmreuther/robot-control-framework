import type { KnownPrefixedKind, ParsedIncomingMessage } from '../model/types';

const KNOWN_PREFIXES: ReadonlySet<string> = new Set([
  'custom',
  'unsubscribe',
  'event',
  'robotinfo',
  'Mode',
  'angles',
]);

export function parseIncomingMessage(msg: string): ParsedIncomingMessage {
  if (!msg.startsWith('x|')) {
    return { kind: 'plain', message: msg };
  }

  const match = /^x\|([^:]+):([\s\S]*)$/.exec(msg);
  if (!match) {
    return { kind: 'plain', message: msg };
  }

  const rawPrefix = match[1] ?? 'unknown';
  const payloadRaw = match[2] ?? '';
  const prefix = (KNOWN_PREFIXES.has(rawPrefix) ? rawPrefix : 'unknown') as KnownPrefixedKind;

  return {
    kind: 'prefixed',
    prefix,
    rawPrefix,
    payloadRaw,
  };
}

export function tryParseJson<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}
