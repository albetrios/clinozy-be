/**
 * Coalesces concurrent calls that share a key onto one in-flight promise.
 *
 * The first caller for a key runs `load`. Later callers for that key await the same promise,
 * including its rejection. The key is forgotten when the promise settles, so a rejection is
 * never kept and the next call loads again. This is process-local: other processes still run
 * their own load. {@link Singleflight.reset} drops in-flight entries so a test can force the
 * next call to load again before the previous one settles.
 */
export interface Singleflight<Value> {
  run(options: { key: string; load: () => Promise<Value> }): Promise<Value>;
  /** Forgets every in-flight key. Promises already returned keep running; new calls load again. */
  reset(): void;
}

/**
 * Creates a process-local coalescer. See {@link Singleflight}.
 */
export function createSingleflight<Value>(): Singleflight<Value> {
  const inFlight = new Map<string, Promise<Value>>();

  return {
    reset() {
      inFlight.clear();
    },
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
