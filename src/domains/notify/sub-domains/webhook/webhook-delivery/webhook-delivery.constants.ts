/**
 * Maximum number of subscribed webhooks dispatched concurrently when fanning a
 * single organization event out to its endpoints. Bounds the parallel work so a
 * large subscriber list cannot stall a worker via N sequential round-trips,
 * while keeping pressure on the shared connection and Redis predictable.
 */
export const WEBHOOK_ORGANIZATION_FANOUT_CONCURRENCY = 10;
