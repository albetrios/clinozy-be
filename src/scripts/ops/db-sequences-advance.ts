/**
 * Moves every bigint id sequence far past its current value — the step after a point-in-time
 * restore, run once on the restored database right after `pnpm db:migrate`
 * (docs/process/dr-runbook.md). Both restore drills run it too.
 *
 * Usage:
 *   DATABASE_MIGRATION_URL=postgresql://... pnpm db:sequences:advance
 *   DATABASE_URL=postgresql://... pnpm db:sequences:advance
 */
import '@/shared/config/load-env-files.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  resolveDatabaseSsl,
  withoutSslQueryParameters,
} from '@/infrastructure/database/utils/connection-url.util.js';

/**
 * How far a restore moves each id sequence: more ids than any lost window could have issued, and
 * still nothing next to the bigint range (9.2 × 10^18).
 */
export const ID_SEQUENCE_RESTORE_GAP = 1_000_000_000n;

/** One sequence {@link advanceIdSequences} moved: its schema-qualified name and its value before and after. */
export interface AdvancedIdSequence {
  sequenceName: string;
  previousValue: bigint;
  advancedValue: bigint;
}

/**
 * Moves every bigint sequence outside the system schemas forward by {@link ID_SEQUENCE_RESTORE_GAP}.
 *
 * @remarks
 * - **Why:** a restore rewinds each sequence along with its rows, but queued job payloads,
 *   commit-dispatch tasks and MFA counters in Redis, the audit exports in S3 and the logs keep the
 *   ids issued after the restore point. Without the jump the restored database would issue those
 *   ids again and point the stale entries at different rows.
 * - **Algorithm:** reads `pg_sequences` (bigint only — the id convention; a never-used sequence
 *   counts from 0), then `setval(last value + gap)` per sequence.
 * - **Failure modes:** throws before changing anything when the role cannot read a sequence (its
 *   `last_value` would read as null and the jump could move it backwards). Sequence changes are not
 *   transactional, so a failure part-way leaves the earlier sequences moved; running it again only
 *   jumps every sequence again, which is harmless.
 * - **Side effects:** advances sequences; returns what moved, in name order, for the incident record.
 * - **Notes:** `schemaNames` limits the pass to those schemas (the unit test's own schema); the
 *   restore step passes none.
 */
export async function advanceIdSequences(options: {
  client: pg.ClientBase;
  schemaNames?: readonly string[];
}): Promise<AdvancedIdSequence[]> {
  const { client, schemaNames } = options;
  const schemaFilter = schemaNames === undefined ? '' : 'AND schemaname = ANY($1::text[])';
  const { rows: sequences } = await client.query<{
    sequence_name: string;
    last_value: string | null;
    is_readable: boolean;
  }>(
    `
    SELECT
      format('%I.%I', schemaname, sequencename) AS sequence_name,
      last_value,
      has_sequence_privilege(format('%I.%I', schemaname, sequencename), 'SELECT, USAGE') AS is_readable
    FROM pg_sequences
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND data_type = 'bigint'::regtype
      ${schemaFilter}
    ORDER BY schemaname, sequencename
  `,
    schemaNames === undefined ? [] : [[...schemaNames]],
  );

  const unreadableSequenceNames = sequences
    .filter((sequence) => !sequence.is_readable)
    .map((sequence) => sequence.sequence_name);
  if (unreadableSequenceNames.length > 0) {
    throw new Error(
      `Cannot read ${unreadableSequenceNames.join(', ')} — run as the role that owns the sequences (DATABASE_MIGRATION_URL).`,
    );
  }

  const advancedSequences: AdvancedIdSequence[] = [];
  for (const sequence of sequences) {
    const previousValue = BigInt(sequence.last_value ?? '0');
    const advancedValue = previousValue + ID_SEQUENCE_RESTORE_GAP;
    await client.query('SELECT setval($1::regclass, $2::bigint)', [
      sequence.sequence_name,
      advancedValue.toString(),
    ]);
    advancedSequences.push({ sequenceName: sequence.sequence_name, previousValue, advancedValue });
  }
  return advancedSequences;
}

async function main(): Promise<void> {
  const connectionUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!connectionUrl) {
    console.error('DATABASE_URL or DATABASE_MIGRATION_URL is required');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: withoutSslQueryParameters(connectionUrl),
    ssl: resolveDatabaseSsl({
      databaseUrl: connectionUrl,
      sslEnabledByDefault: false,
      rejectUnauthorizedOverride: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
    }),
    connectionTimeoutMillis: 15_000,
  });
  client.on('error', (error) => console.error('Database connection error', error));
  await client.connect();
  try {
    const advancedSequences = await advanceIdSequences({ client });
    for (const sequence of advancedSequences) {
      console.log(
        `${sequence.sequenceName}: ${sequence.previousValue.toString()} -> ${sequence.advancedValue.toString()}`,
      );
    }
    console.log(`Advanced ${String(advancedSequences.length)} id sequences.`);
  } finally {
    await client.end();
  }
}

const currentScriptPath = resolve(fileURLToPath(import.meta.url));

if (process.argv[1] && resolve(process.argv[1]) === currentScriptPath) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
