import { describe, expect, it } from 'vitest';

import { CHAOS_POSTGRES_PROXY_NAME } from '@/tests/chaos/chaos.constants.js';
import {
  resetChaosTestingListeningProxyFailuresGloballyViaToxiproxy,
  withTemporaryListeningProxyToxinForChaosAssertion,
} from '@/tests/chaos/helpers/toxiproxy.client.js';
import { sql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';

describe('Chaos resilience: Postgres RST through reset_peer toxin', () => {
  it('eventually reconnects cleanly after toxin removal restores upstream TCP', async () => {
    // Poison an established connection: a cold handshake otherwise reconnects while its query waits.
    await expect(database.execute(sql`SELECT 1`)).resolves.not.toThrow();
    await withTemporaryListeningProxyToxinForChaosAssertion(
      CHAOS_POSTGRES_PROXY_NAME,
      {
        name: 'postgres_upstream_reset_peer_observer',
        type: 'reset_peer',
        stream: 'upstream',
        toxicity: 1,
        attributes: {
          timeout: 0,
        },
      },
      async () => {
        await expect(database.execute(sql`SELECT 1`)).rejects.toThrow();
      },
    );

    await expect(database.execute(sql`SELECT 1`)).resolves.not.toThrow();
    await resetChaosTestingListeningProxyFailuresGloballyViaToxiproxy();
  });
});
