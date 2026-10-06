/** BullMQ queue for daily audit log export to S3 (NDJSON gzip per organization). */
export const AUDIT_EXPORT_QUEUE_NAME = 'audit-export';

/**
 * Days back each run exports — yesterday and the two days before. A day already exported for a
 * tenant (its manifest exists) costs one S3 HEAD; a day a failed run left out is exported now.
 */
export const AUDIT_EXPORT_LOOKBACK_DAYS = 3;

/** Filename used for the per-export manifest sidecar uploaded next to the NDJSON parts. */
export const AUDIT_EXPORT_MANIFEST_FILENAME = 'manifest.json';
/** Manifest schema version literal — bump when the manifest shape changes incompatibly. */
export const AUDIT_EXPORT_SCHEMA_VERSION = '1';

/**
 * One line of an export part (NDJSON). Every id is a public id — the archive outlives the
 * database, whose bigserials a restore reissues.
 *
 * @remarks
 * `id` is the audit row's own public id (`aud_…`, the dedupe key for a re-run's duplicate
 * parts); `organization_id`, `actor_user_id` and `target_user_id` are the public ids the audit
 * API returns (`null` when the row has none, or the user was hard-deleted since). `metadata` is
 * sanitized like the API's: internal-id keys dropped, secret-looking values redacted.
 */
export interface AuditExportRow {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  action: string;
  resource_type: string;
  severity: string;
  metadata: unknown;
  created_at: string;
}

/** One uploaded object entry inside an {@link AuditExportManifest} (single NDJSON.gz part). */
export interface AuditExportManifestObject {
  key: string;
  row_count: number;
  sha256: string;
  format: 'ndjson';
  content_type: 'application/gzip';
}

/**
 * Top-level manifest persisted alongside an organization's daily audit export;
 * downstream tooling reads `objects[]` to verify the part files (size, sha256).
 */
export interface AuditExportManifest {
  schema_version: typeof AUDIT_EXPORT_SCHEMA_VERSION;
  export_date: string;
  /** The organization's public id (`org_…`) — stable across databases, unlike its bigserial. */
  organization_public_id: string;
  objects: AuditExportManifestObject[];
}
