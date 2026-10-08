/**
 * Coalesces concurrent calls that share a key onto one in-flight promise.
 *
 * The first caller for a key runs `load`. Later callers for that key await the same promise,
 * including its rejection. The key is forgotten when the promise settles, so the next call loads
 * again. This is process-local: other processes still run their own load.
 */
export function createSingleflight<Value>(): {
  run(options: { key: string; load: () => Promise<Value> }): Promise<Value>;
} {
  const inFlight = new Map<string, Promise<Value>>();

  return {
    run(options) {
      const existing = inFlight.get(options.key);
      if (existing) return existing;

      // `then` turns a synchronous throw from `load` into a rejection, and still shares that
      // rejection with callers that joined before the microtask ran.
      const flight = Promise.resolve().then(() => options.load());
      const tracked = flight.finally(() => {
        if (inFlight.get(options.key) === tracked) {
          inFlight.delete(options.key);
        }
      });
      inFlight.set(options.key, tracked);
      return tracked;
    },
  };
}
