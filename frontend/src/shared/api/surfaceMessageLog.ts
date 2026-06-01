export type SurfaceMessageLogListener = (line: string) => void;

const listeners = new Set<SurfaceMessageLogListener>();

export function emitSurfaceMessageLog(line: string): void {
  const timestamp = new Date().toLocaleTimeString();
  const formatted = `${timestamp} ${line}`;
  for (const listener of listeners) {
    listener(formatted);
  }
}

export function onSurfaceMessageLog(
  listener: SurfaceMessageLogListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
