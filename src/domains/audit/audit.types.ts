import type { AuditLogInsert } from './audit.schema.js';

/**
 * Repository-level filters for {@link AuditRepository.findWithFilters}. All
 * identifiers are already resolved to internal numeric ids by the service;
 * `from`/`to` are ISO-8601 strings, `after` is an opaque cursor, and `limit`
 * is the page size enforced by the route's pagination schema.
 */
export interface AuditLogFilters {
  organization_id?: number;
  actor_user_id?: number;
  resource_type?: string;
  action?: string;
  from?: string;
  to?: string;
  after?: string;
  limit: number;
  /** When true, run the expensive count(*) on this growing table; total is otherwise null. */
  include_total?: boolean;
}

/** Row shape for inserting into `audit.logs` — {@link AuditRepository.insert} mints the public id. */
export type NewAuditLog = Omit<AuditLogInsert, 'public_id'>;

/**
 * Who performed an audited action: exactly one of an acting user, an acting organization API key,
 * or a declared anonymous (pre-authentication) caller.
 *
 * @remarks
 * Part of every audit write ({@link AuditLogRecordInput}), so the compiler rejects a call that
 * names no actor. The audit service used to drop such rows at runtime with only a log line — every
 * `auth.login_failure`, `auth.password.reset`, `auth.mfa.recovery_code_used` and API-key
 * `auth.permission.denied` row was lost that way. The `?: never` members forbid naming two kinds
 * at once. `AuditService.record` keeps a runtime backstop for a value that bypasses the type.
 */
export type AuditActor =
  | {
      /** Public id of the acting user. */
      actorUserPublicId: string;
      actorApiKeyPublicId?: never;
      anonymousActor?: never;
    }
  | {
      /** Public id of the acting organization API key, when a key rather than a user performed the action. */
      actorApiKeyPublicId: string;
      actorUserPublicId?: never;
      anonymousActor?: never;
    }
  | {
      /**
       * A pre-authentication event with no actor by design (e.g. `auth.login_failure`: the caller
       * is not authenticated, and naming the targeted account would leak it). The row is staged
       * with `metadata.actor_kind = 'anonymous'`.
       */
      anonymousActor: true;
      actorUserPublicId?: never;
      actorApiKeyPublicId?: never;
    };

/**
 * Server-internal audit input: the {@link AuditActor} plus the {@link AuditLogRecordFields}.
 * After P0-#2 (audit outbox) this carries only `*_public_id` fields — the drain worker resolves
 * them to internal ids out-of-band, so the request handler never pays a lookup-then-insert tax
 * (or a per-row transaction for bulk operations).
 */
export type AuditLogRecordInput = AuditActor & AuditLogRecordFields;

/** The fields of an audit write other than its {@link AuditActor}. */
export interface AuditLogRecordFields {
  action: string;
  resource_type: string;
  resource_id?: number | null;
  /** Public id of the user being acted upon (NEW — replaces the old internal `target_user_id`). */
  target_user_public_id?: string | null;
  /** Organization public id (NEW — replaces the old internal `organization_id`). */
  organization_public_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  severity?: string;
  metadata?: Record<string, unknown>;
}
