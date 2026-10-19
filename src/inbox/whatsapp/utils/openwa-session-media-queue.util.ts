/**
 * Serializes OpenWA media downloads per session so a chat thread cannot stampede
 * the gateway (videos are slow; parallel GETs often yield 429).
 */
const sessionChains = new Map<string, Promise<unknown>>();

export function runOpenWaSessionMediaTask<T>(
  sessionId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = sessionChains.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => task());
  sessionChains.set(
    sessionId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/** Test helper */
export function clearOpenWaSessionMediaQueues(): void {
  sessionChains.clear();
}
