import type { Redis } from 'ioredis';
import { FIVE_SECONDS_MS } from '@/shared/constants/ttl.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Closes one ioredis client so it cannot hold the process open: a client that is not `ready`
 * is disconnected at once, a ready one is sent `QUIT` raced against a 5s timeout, after which
 * it is disconnected.
 *
 * @remarks
 * A client that never connected (`lazyConnect`) or is reconnecting after a drop cannot send
 * `QUIT`: with `enableOfflineQueue: false` ioredis rejects it ("Stream isn't writeable"), with
 * the queue on it waits for a reconnect that may never come. Either way the retry timer keeps
 * the event loop alive, so the process never exits (the CI test report email hung until its
 * job timeout). `disconnect()` stops the reconnects and closes the socket. The timeout timer
 * is cleared once `QUIT` wins, so a clean close neither waits 5s nor logs a false timeout.
 */
export async function closeRedisClient({
  client,
  timeoutEvent,
}: {
  client: Redis;
  timeoutEvent: string;
}): Promise<void> {
  if (client.status !== 'ready') {
    client.disconnect();
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<true>((resolve) => {
    timer = setTimeout(() => resolve(true), FIVE_SECONDS_MS);
  });
  try {
    const didTimeOut = await Promise.race([client.quit().then(() => false), timedOut]);
    if (didTimeOut) {
      logger.warn(timeoutEvent);
      client.disconnect();
    }
  } finally {
    clearTimeout(timer);
  }
}
