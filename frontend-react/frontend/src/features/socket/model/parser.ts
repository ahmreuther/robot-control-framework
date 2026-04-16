import type { KnownPrefixedKind, ParsedIncomingMessage } from './types';

const KNOWN_PREFIXES: ReadonlySet<string> = new Set([
  'custom',
  'unsubscribe',
  'event',
  'robotinfo',
  'Mode',
  'angles',
]);

export interface NormalizedIncomingMessage {
  scope: string | null;
  message: string;
}

/**
 * Normalize incoming backend messages.
 *
 * Supports both shapes during migration:
 * - `x|prefix:payload` (legacy single-robot style)
 * - `url|x|prefix:payload` (new multi-robot style)
 *
 * For plain messages, also supports `url|plain message`.
 */
export function normalizeIncomingMessage(raw: string): NormalizedIncomingMessage {
  if (!raw) {
    return { scope: null, message: raw };
  }

  if (raw.startsWith('x|')) {
    return { scope: null, message: raw };
  }

  const prefixedWithScopeMatch = /^(.*?)\|x\|([\s\S]*)$/.exec(raw);
  if (prefixedWithScopeMatch) {
    const scope = prefixedWithScopeMatch[1] ?? null;
    const rest = prefixedWithScopeMatch[2] ?? '';
    return {
      scope: scope || null,
      message: `x|${rest}`,
    };
  }

  const plainWithScopeMatch = /^(.*?)\|(?!x\|)([\s\S]*)$/.exec(raw);
  if (plainWithScopeMatch) {
    const scope = plainWithScopeMatch[1] ?? null;
    const rest = plainWithScopeMatch[2] ?? '';
    return {
      scope: scope || null,
      message: rest,
    };
  }

  return { scope: null, message: raw };
}

export function parseIncomingMessage(msg: string): ParsedIncomingMessage {
  const normalized = normalizeIncomingMessage(msg);
  const normalizedMessage = normalized.message;

  if (!normalizedMessage.startsWith('x|')) {
    return { kind: 'plain', message: normalizedMessage };
  }

  const match = /^x\|([^:]+):([\s\S]*)$/.exec(normalizedMessage);
  if (!match) {
    return { kind: 'plain', message: normalizedMessage };
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
