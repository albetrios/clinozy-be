import { env } from '@/shared/config/env.config.js';

/**
 * API process count for a budget that is counted per process and then scaled back to the cluster.
 *
 * Prefers `DEPLOYMENT_API_REPLICA_COUNT`, then `DEPLOYMENT_TOTAL_REPLICA_COUNT`, then one process.
 * A partial API/worker split is not an error here — the connection-budget guard owns that check.
 *
 * @remarks
 * The rate-limit fallback store and the connection-budget split both call this, so the two cannot
 * drift. A configured max smaller than the count cannot be divided and stays per process.
 */
export function resolveApiReplicaCount(): number {
  return env.DEPLOYMENT_API_REPLICA_COUNT ?? env.DEPLOYMENT_TOTAL_REPLICA_COUNT ?? 1;
}
