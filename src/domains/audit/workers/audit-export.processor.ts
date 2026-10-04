import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, gte, isNotNull, lt } from 'drizzle-orm';
import { logs } from '@/domains/audit/audit.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { headObject, putObjectBuffer } from '@/infrastructure/storage/storage.service.js';
import { gzipBufferAsync } from '@/shared/utils/infrastructure/gzip.util.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  AUDIT_EXPORT_MANIFEST_FILENAME,
  AUDIT_EXPORT_SCHEMA_VERSION,
  type AuditExportManifest,
} from '@/domains/audit/workers/audit-export.constants.js';

function previousUtcDayRange(referenceDate = new Date()): {
  start: Date;
  end: Date;
  dateLabel: string;
} {
  const end = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  const dateLabel = start.toISOString().slice(0, 10);
  return { start, end, dateLabel };
}

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
 * manifest's existence before exporting (`headObject(manifestKey)`) and writes
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
 * Exports the previous UTC day's audit log entries to S3 for every tenant that
 * produced events.
 *
 * @remarks
 * Pull-based daily job:
 *
 * 1. Computes the previous UTC day (`[D-1, D)`) — bounded by UTC midnights so
 *    the same job can run from any time zone without missing or double-counting
 *    rows.
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
export async function runAuditExportJob(databaseHandle: WorkerDatabaseHandle): Promise<{
  exportedOrganizations: number;
  skipped: number;
}> {
  if (!(env.AUDIT_EXPORT_ENABLED && env.S3_BUCKET)) {
    logger.info('audit-export.skipped — disabled or S3_BUCKET unset');
    return { exportedOrganizations: 0, skipped: 0 };
  }

  const { start, end, dateLabel } = previousUtcDayRange();
  logger.info(
    { start: start.toISOString(), end: end.toISOString(), dateLabel },
    'audit-export.starting',
  );

  const organizationRows = await databaseHandle
    .selectDistinct({
      organization_id: logs.organization_id,
      organization_public_id: organizations.public_id,
    })
    .from(logs)
    .innerJoin(organizations, eq(logs.organization_id, organizations.id))
    .where(
      and(isNotNull(logs.organization_id), gte(logs.created_at, start), lt(logs.created_at, end)),
    );

  let exportedOrganizations = 0;
  let skipped = 0;

  for (const {
    organization_id: organizationId,
    organization_public_id: organizationPublicId,
  } of organizationRows) {
    if (organizationId === null) continue;

    const manifestKey = buildManifestKey({ organizationPublicId, dateLabel });
    const existingManifest = await headObject(manifestKey);
    if (existingManifest) {
      skipped += 1;
      continue;
    }

    const manifestObjects = await collectOrganizationAuditBatches({
      databaseHandle,
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

    await putObjectBuffer({
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

  logger.info({ exportedOrganizations, skipped, dateLabel }, 'audit-export.completed');
  return { exportedOrganizations, skipped };
}

/**
 * Streams one organization's audit logs for the day window in keyset batches, gzip-uploading
 * each batch to S3 and returning the manifest object descriptors (empty when there are no rows).
 */
async function collectOrganizationAuditBatches(options: {
  databaseHandle: WorkerDatabaseHandle;
  organizationId: number;
  organizationPublicId: string;
  dateLabel: string;
  start: Date;
  end: Date;
}): Promise<AuditExportManifest['objects']> {
  const { databaseHandle, organizationId, organizationPublicId, dateLabel, start, end } = options;
  const batchSize = env.AUDIT_EXPORT_BATCH_SIZE;
  let afterId = 0;
  const manifestObjects: AuditExportManifest['objects'] = [];

  while (true) {
    const rows = await databaseHandle
      .select({
        id: logs.id,
        organization_id: logs.organization_id,
        actor_user_id: logs.actor_user_id,
        action: logs.action,
        resource_type: logs.resource_type,
        resource_id: logs.resource_id,
        severity: logs.severity,
        metadata: logs.metadata,
        created_at: logs.created_at,
      })
      .from(logs)
      .where(
        and(
          eq(logs.organization_id, organizationId),
          gte(logs.created_at, start),
          lt(logs.created_at, end),
          gt(logs.id, afterId),
        ),
      )
      .orderBy(asc(logs.id))
      .limit(batchSize);

    if (rows.length === 0) break;

    const lines = rows.map((row) => `${JSON.stringify(row)}\n`);
    const body = await gzipBufferAsync(Buffer.from(lines.join(''), 'utf8'));
    const sha256 = createHash('sha256').update(body).digest('hex');
    const batchPartId = randomUUID();
    const objectKey = buildExportKey({ organizationPublicId, dateLabel, partId: batchPartId });

    await putObjectBuffer({
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
