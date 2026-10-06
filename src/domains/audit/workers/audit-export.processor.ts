import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, gte, isNotNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { logs } from '@/domains/audit/audit.schema.js';
import { sanitizeAuditMetadata } from '@/domains/audit/audit.serializer.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { users } from '@/domains/user/user.schema.js';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import { gzipBufferAsync } from '@/shared/utils/infrastructure/gzip.util.js';
import {
  runGlobalRetentionWorkerJob,
  type WorkerDatabaseHandle,
} from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  AUDIT_EXPORT_LOOKBACK_DAYS,
  AUDIT_EXPORT_MANIFEST_FILENAME,
  AUDIT_EXPORT_SCHEMA_VERSION,
  type AuditExportManifest,
  type AuditExportRow,
} from '@/domains/audit/workers/audit-export.constants.js';

const actorUsers = alias(users, 'actor_users');
const targetUsers = alias(users, 'target_users');

/** One UTC day, `daysAgo` days before `referenceDate`'s day: `[start, end)` and its `YYYY-MM-DD`. */
function utcDayRange(options: { referenceDate: Date; daysAgo: number }): {
  start: Date;
  end: Date;
  dateLabel: string;
} {
  const { referenceDate, daysAgo } = options;
  const end = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate() - daysAgo + 1,
    ),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  const dateLabel = start.toISOString().slice(0, 10);
  return { start, end, dateLabel };
}

/** Runs one short database read; S3 calls stay outside it. */
type AuditExportDatabaseRunner = <TResult>(
  work: (databaseHandle: WorkerDatabaseHandle) => Promise<TResult>,
) => Promise<TResult>;

function exportPrefix(): string {
  return env.AUDIT_EXPORT_S3_PREFIX.replace(/\/$/, '');
}

/**
 * Builds the S3 object key for one gzipped NDJSON part file inside an audit
 * export.
 *
 * @remarks
 * Layout is `<prefix>/organization_public_id=<org public id>/dt=<YYYY-MM-DD>/part-<uuid>.jsonl.gz`,
 * which gives Hive/Athena partition pruning by organization and `dt` and makes per-tenant
 * retention deletes cheap. The partition is the organization's PUBLIC id, not its bigserial: the
 * archive outlives the database, the bigserial restarts at 1 after a restore or reset, and every
 * database writing to a shared bucket counts from 1 — keyed by it, two organizations shared one
 * partition and the second one's day was skipped as already exported. The trailing `partId` is a
 * UUID so a re-run after a partial failure cannot collide with the previous attempt.
 */
export function buildExportKey(options: {
  organizationPublicId: string;
  dateLabel: string;
  partId: string;
}): string {
  return `${exportPrefix()}/organization_public_id=${options.organizationPublicId}/dt=${options.dateLabel}/part-${options.partId}.jsonl.gz`;
}

/**
 * Builds the S3 object key for the per-tenant per-day export manifest.
 *
 * @remarks
 * The manifest is the idempotency key for this job: the processor checks the
 * manifest's existence before exporting (a HEAD of `manifestKey`) and writes
 * it last, after all data parts have been uploaded successfully. A retry that
 * sees the manifest skips the tenant entirely — which is why it is keyed by the
 * organization's public id (see {@link buildExportKey}).
 */
export function buildManifestKey(options: {
  organizationPublicId: string;
  dateLabel: string;
}): string {
  return `${exportPrefix()}/organization_public_id=${options.organizationPublicId}/dt=${options.dateLabel}/${AUDIT_EXPORT_MANIFEST_FILENAME}`;
}

/**
 * Exports the last {@link AUDIT_EXPORT_LOOKBACK_DAYS} UTC days' audit log entries to S3 for every
 * tenant that produced events and has no manifest for that day yet.
 *
 * @remarks
 * Pull-based daily job. Every database read runs in its own short retention context
 * (`runInDatabaseContext`, one per discovery and per batch) and every S3 call outside one: a
 * single transaction across the whole export sat idle through each S3 request, and one slow
 * upload past the 30-second `idle_in_transaction_session_timeout` ended the session — with the
 * day's remaining tenants never exported, since the job has one attempt and used to export only
 * yesterday.
 *
 * 1. For each of the last {@link AUDIT_EXPORT_LOOKBACK_DAYS} UTC days (`[D-n, D-n+1)`, bounded by
 *    UTC midnights so the job can run from any time zone without missing or double-counting rows)
 *    — the lookback re-exports whatever a failed run left out.
 * 2. Discovers active tenants via `selectDistinct(organization_id)` over the
 *    window, with each organization's public id (the S3 partition). This avoids
 *    holding a giant cursor over the full `logs` table. The global-retention
 *    scope reads organizations, soft-deleted ones included.
 * 3. For each tenant, checks whether the manifest already exists; if so the
 *    tenant is treated as already exported (idempotent on retry).
 * 4. Streams rows in `AUDIT_EXPORT_BATCH_SIZE` chunks ordered by `id` (stable,
 *    monotonic), writes one gzipped NDJSON part (compressed off-thread via
 *    {@link gzipBufferAsync} so job-lock renewal is not starved), then the manifest.
 *    The manifest is the LAST write so a crash mid-export leaves no manifest
 *    and the next run re-tries cleanly.
 * 5. Records sha256 of the gzipped body in S3 object metadata + manifest, so
 *    consumers can verify integrity without re-downloading the part.
 *
 * Honors `AUDIT_EXPORT_ENABLED` and `S3_BUCKET`; either being unset short-
 * circuits the whole job. Tenants with zero rows in the window are skipped
 * (no empty parts, no manifest).
 */
export async function runAuditExportJob(
  options: {
    runInDatabaseContext?: AuditExportDatabaseRunner;
    lookbackDays?: number;
    referenceDate?: Date;
  } = {},
): Promise<{
  exportedOrganizations: number;
  skipped: number;
}> {
  if (!(env.AUDIT_EXPORT_ENABLED && env.S3_BUCKET)) {
    logger.info('audit-export.skipped — disabled or S3_BUCKET unset');
    return { exportedOrganizations: 0, skipped: 0 };
  }
  const runInDatabaseContext = options.runInDatabaseContext ?? runGlobalRetentionWorkerJob;
  const referenceDate = options.referenceDate ?? new Date();
  const lookbackDays = options.lookbackDays ?? AUDIT_EXPORT_LOOKBACK_DAYS;

  let exportedOrganizations = 0;
  let skipped = 0;
  for (let daysAgo = 1; daysAgo <= lookbackDays; daysAgo += 1) {
    const day = await exportAuditDay({
      runInDatabaseContext,
      ...utcDayRange({ referenceDate, daysAgo }),
    });
    exportedOrganizations += day.exportedOrganizations;
    skipped += day.skipped;
  }
  logger.info({ exportedOrganizations, skipped, lookbackDays }, 'audit-export.completed');
  return { exportedOrganizations, skipped };
}

/** Exports one UTC day for every tenant with events that day and no manifest for it yet. */
async function exportAuditDay(options: {
  runInDatabaseContext: AuditExportDatabaseRunner;
  start: Date;
  end: Date;
  dateLabel: string;
}): Promise<{ exportedOrganizations: number; skipped: number }> {
  const { runInDatabaseContext, start, end, dateLabel } = options;
  logger.info(
    { start: start.toISOString(), end: end.toISOString(), dateLabel },
    'audit-export.starting',
  );

  const organizationRows = await runInDatabaseContext((databaseHandle) =>
    databaseHandle
      .selectDistinct({
        organization_id: logs.organization_id,
        organization_public_id: organizations.public_id,
      })
      .from(logs)
      .innerJoin(organizations, eq(logs.organization_id, organizations.id))
      .where(
        and(isNotNull(logs.organization_id), gte(logs.created_at, start), lt(logs.created_at, end)),
      ),
  );

  let exportedOrganizations = 0;
  let skipped = 0;

  for (const {
    organization_id: organizationId,
    organization_public_id: organizationPublicId,
  } of organizationRows) {
    if (organizationId === null) continue;

    const manifestKey = buildManifestKey({ organizationPublicId, dateLabel });
    // A failed HEAD throws (the job retries): read as "no manifest" it re-exported the day under
    // fresh part ids, leaving the first export's parts behind as duplicates.
    const existingManifest = await getDefaultS3ObjectStorageAdapter().headObject(manifestKey);
    if (existingManifest) {
      skipped += 1;
      continue;
    }

    const manifestObjects = await collectOrganizationAuditBatches({
      runInDatabaseContext,
      organizationId,
      organizationPublicId,
      dateLabel,
      start,
      end,
    });

    if (manifestObjects.length === 0) {
      skipped += 1;
      continue;
    }

    const manifest: AuditExportManifest = {
      schema_version: AUDIT_EXPORT_SCHEMA_VERSION,
      export_date: dateLabel,
      organization_public_id: organizationPublicId,
      objects: manifestObjects,
    };

    await getDefaultS3ObjectStorageAdapter().putObject({
      key: manifestKey,
      body: Buffer.from(JSON.stringify(manifest), 'utf8'),
      contentType: 'application/json',
    });

    exportedOrganizations += 1;
    const rowCount = manifestObjects.reduce((total, object) => total + object.row_count, 0);
    logger.info(
      { organizationPublicId, manifestKey, partCount: manifestObjects.length, rowCount },
      'audit-export.organization.completed',
    );
  }

  logger.info({ exportedOrganizations, skipped, dateLabel }, 'audit-export.day_completed');
  return { exportedOrganizations, skipped };
}

/**
 * Streams one organization's audit logs for the day window in keyset batches — each read in its
 * own short database context — gzip-uploading each batch to S3 outside it, and returns the
 * manifest object descriptors (empty when there are no rows).
 */
async function collectOrganizationAuditBatches(options: {
  runInDatabaseContext: AuditExportDatabaseRunner;
  organizationId: number;
  organizationPublicId: string;
  dateLabel: string;
  start: Date;
  end: Date;
}): Promise<AuditExportManifest['objects']> {
  const { runInDatabaseContext, organizationId, organizationPublicId, dateLabel, start, end } =
    options;
  const batchSize = env.AUDIT_EXPORT_BATCH_SIZE;
  let afterId = 0;
  const manifestObjects: AuditExportManifest['objects'] = [];

  while (true) {
    // The global-retention context reads auth.users (it has a retention arm), so actor and
    // target resolve to public ids here; a user hard-deleted since leaves the column null.
    const rows = await runInDatabaseContext((databaseHandle) =>
      databaseHandle
        .select({
          id: logs.id,
          public_id: logs.public_id,
          actor_user_public_id: actorUsers.public_id,
          target_user_public_id: targetUsers.public_id,
          action: logs.action,
          resource_type: logs.resource_type,
          severity: logs.severity,
          metadata: logs.metadata,
          created_at: logs.created_at,
        })
        .from(logs)
        .leftJoin(actorUsers, eq(logs.actor_user_id, actorUsers.id))
        .leftJoin(targetUsers, eq(logs.target_user_id, targetUsers.id))
        .where(
          and(
            eq(logs.organization_id, organizationId),
            gte(logs.created_at, start),
            lt(logs.created_at, end),
            gt(logs.id, afterId),
          ),
        )
        .orderBy(asc(logs.id))
        .limit(batchSize),
    );

    if (rows.length === 0) break;

    const lines = rows.map(
      (row) => `${JSON.stringify(toAuditExportRow({ row, organizationPublicId }))}\n`,
    );
    const body = await gzipBufferAsync(Buffer.from(lines.join(''), 'utf8'));
    const sha256 = createHash('sha256').update(body).digest('hex');
    const batchPartId = randomUUID();
    const objectKey = buildExportKey({ organizationPublicId, dateLabel, partId: batchPartId });

    await getDefaultS3ObjectStorageAdapter().putObject({
      key: objectKey,
      body,
      contentType: 'application/gzip',
      metadata: {
        format: 'ndjson',
        schema_version: AUDIT_EXPORT_SCHEMA_VERSION,
        export_date: dateLabel,
        row_count: String(rows.length),
        sha256,
      },
    });

    manifestObjects.push({
      key: objectKey,
      row_count: rows.length,
      sha256,
      format: 'ndjson',
      content_type: 'application/gzip',
    });

    afterId = rows.at(-1)?.id ?? afterId;

    if (rows.length < batchSize) break;
  }

  return manifestObjects;
}

/** Inputs for {@link toAuditExportRow}: one selected `audit.logs` row and its organization. */
interface ToAuditExportRowOptions {
  row: {
    public_id: string;
    actor_user_public_id: string | null;
    target_user_public_id: string | null;
    action: string;
    resource_type: string;
    severity: string;
    metadata: unknown;
    created_at: Date;
  };
  organizationPublicId: string;
}

/**
 * One NDJSON line of the export: public ids only — the archive outlives the database, and a
 * restore reissues bigserials — and metadata sanitized exactly as the audit API returns it.
 *
 * @remarks
 * - **Algorithm:** maps the selected row (actor/target already joined to public ids) and the
 *   organization's public id onto {@link AuditExportRow}; `metadata` goes through
 *   `sanitizeAuditMetadata`.
 * - **Failure modes:** none — pure mapping.
 * - **Side effects:** none.
 * - **Notes:** IP address, user agent and the internal `resource_id` are never exported.
 */
export function toAuditExportRow({
  row,
  organizationPublicId,
}: ToAuditExportRowOptions): AuditExportRow {
  return {
    id: row.public_id,
    organization_id: organizationPublicId,
    actor_user_id: row.actor_user_public_id,
    target_user_id: row.target_user_public_id,
    action: row.action,
    resource_type: row.resource_type,
    severity: row.severity,
    metadata: sanitizeAuditMetadata(row.metadata),
    created_at: row.created_at.toISOString(),
  };
}
