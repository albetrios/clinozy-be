import type { PgTable } from 'drizzle-orm/pg-core';
import type { ZodType } from 'zod';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import type {
  BaseRecordChildTable,
  BaseRecordLinkTable,
  BaseRecordListQuery,
  BaseRecordRepository,
  BaseRecordRow,
} from './base-record.repository.js';

/** A body field that names one record of another table by public id (stored as its id). */
export interface BaseRecordReference {
  /** Body field and column (e.g. `patient_id`). */
  field: string;
  table: PgTable;
  /** What the referenced record is, for the 400 message (e.g. `patient`). */
  label: string;
}

/** A body field that names a list of records of another table, kept in a link table. */
export interface BaseRecordReferenceList {
  field: string;
  link: BaseRecordLinkTable;
  label: string;
  /** Column values every named record must also have (`{ is_active: true }`) — else the same 400. */
  require?: Readonly<Record<string, unknown>>;
  /**
   * The 400's message key for a named record that is not live here (or misses `require`), with
   * `id` as its param — the generic `recordReferenceNotFound` when omitted.
   */
  notFoundKey?: string;
  /** An empty list means every record (no branches = every branch, O5): a list filter keeps the unlinked rows too. */
  emptyMeansEvery?: boolean;
}

/**
 * A body field that is a set of child rows in their own table, without public ids (`phones` on a
 * contact): taken from a write's values after the rules' prepare hooks, written after the record
 * (a sent set replaces the whole set), and read back for single-record responses only — a list
 * page never reads it.
 */
export interface BaseRecordChildList extends BaseRecordChildTable {
  /** Body and response field (`phones`). */
  field: string;
}

/** The record a nested route lives under (`/patients/{patient_id}/notes`). */
export interface BaseRecordParent {
  /** Path param and column (e.g. `patient_id`). */
  field: string;
  table: PgTable;
  /** The 404 name when the parent is not here (e.g. `Patient`). */
  label: string;
}

/** A lifecycle action (`POST …/{id}/cancel`): which statuses allow it and what it writes. */
export interface BaseRecordTransition {
  /** Column holding the status the action checks. */
  statusColumn?: string;
  /** Statuses the record may be in; absent = any. */
  from?: readonly string[];
  /** Fixed values the action writes. */
  set?: Readonly<Record<string, unknown>>;
  /** Columns stamped with the current time. */
  stamp?: readonly string[];
  /** Parses the action's body into extra values (references inside are resolved). */
  parse?: (body: unknown) => Record<string, unknown>;
}

/** A list query as a table's validator parses it, before references are resolved. */
export type BaseRecordListInput = BaseRecordListQuery & {
  /** Reference filters by public id (`?patient_id=pat_…`); an unknown id gives an empty page. */
  referenceEquals?: Record<string, string | undefined>;
  /**
   * Filters through a reference list, by its field → one public id (`{ branch_ids: 'brn_…' }` for
   * `?branch_id=`); an unknown id gives an empty page.
   */
  linkEquals?: Record<string, string | undefined>;
  /** The header branch picker (`?branch_ids=brn_…,brn_…`); absent or empty = every branch. */
  branchPublicIds?: readonly string[] | undefined;
};

/**
 * What the caller may see of a branch-scoped table (D9): every branch, or only their own.
 *
 * @remarks
 * - **Notes:** the controller decides it from `branch:read` ("See every branch"); a call without
 *   it (an internal caller) is not narrowed.
 */
export interface BaseRecordVisibility {
  /** The caller holds `branch:read` — Owner and Admin by default. */
  allBranches: boolean;
  /** Whether the caller holds a permission code — for rules a permission changes (D18). */
  can?: (code: string) => Promise<boolean>;
}

/** Reads the public ids a row's references point at, for the serializer. */
export interface BaseRecordReferenceLookup {
  publicIdOf(field: string, row: BaseRecordRow): string | null;
  listOf(field: string, row: BaseRecordRow): string[];
  /** A child list's rows (`phones`) — `undefined` on a list page, which never reads them. */
  childrenOf(field: string, row: BaseRecordRow): Record<string, unknown>[] | undefined;
}

/** The organization's operating settings a rule reads (launch #1) and its time zone (D41). */
export interface OrganizationOperatingSettings {
  /** Rupees. */
  default_day_float: number;
  lead_hold_days: number;
  reminder_hour: number;
  retarget_after_days: number;
  deleted_record_purge_days: number;
  /** IANA time zone — the organization's "today". */
  timezone: string;
}

/**
 * What table rules may call outside the app records — wired once by the app container, so a
 * rule never imports another domain.
 *
 * @remarks
 * - **Notes:** every port runs inside the caller's organization context (same transaction).
 */
export interface BaseRecordPorts {
  /** The organization's operating settings and time zone. */
  organizationSettings: (
    scope: OrganizationPrincipalDatabaseScope,
  ) => Promise<OrganizationOperatingSettings>;
  /**
   * `fileKey`'s confirmed upload of the organization (an entry's attachments M6, a photo P25, a
   * report's files P29) — late-wired from the upload domain; null for a key that is missing,
   * pending or another organization's.
   */
  findConfirmedUpload: (options: {
    organizationId: number;
    fileKey: string;
  }) => Promise<BaseRecordConfirmedUpload | null>;
  /**
   * Rewrites `fileKey`'s stored photo without where it was taken (launch D79, WC-42) — late-wired
   * from the upload domain; called outside any database context, before the photo is filed. Throws
   * for a key that is not the organization's confirmed upload, or when the storage fails.
   */
  removeImageLocation: (options: {
    scope: OrganizationPrincipalDatabaseScope;
    organizationId: number;
    fileKey: string;
  }) => Promise<void>;
  /**
   * A short-lived view link, with the uploaded file's name, for each of the organization's
   * confirmed uploads among `fileKeys` (a photo, a report's files — launch D86) — late-wired from
   * the upload domain; a key that is none has no entry. Runs in the read's organization context;
   * the record's own gate decides who receives the links.
   */
  fileReadUrls: (options: {
    organizationId: number;
    fileKeys: readonly string[];
  }) => Promise<ReadonlyMap<string, BaseRecordFileLink>>;
}

/** A stored file's short-lived view link and the name the person uploaded it under. */
export interface BaseRecordFileLink {
  url: string;
  fileName: string;
}

/** What a rule reads of a confirmed upload: its type, the client's file name, its size in bytes. */
export interface BaseRecordConfirmedUpload {
  mimeType: string;
  fileName: string;
  fileSize: number;
}

/** Where a write runs — the organization, the actor and the scope (for other services). */
export interface BaseRecordWriteContext {
  scope: OrganizationPrincipalDatabaseScope;
  organizationId: number;
  /** The acting user's id (null for an API key). */
  userId: number | null;
  /** What rules may call outside the app records. */
  ports: BaseRecordPorts;
  /**
   * Whether the caller holds a permission code (D18 special permissions in a rule). An internal
   * call — no request — holds every code.
   */
  can: (code: string) => Promise<boolean>;
}

/** What a write did, for {@link BaseRecordRules.afterWrite}. */
export interface BaseRecordChange {
  kind: 'create' | 'update' | 'transition' | 'delete' | 'restore';
  /** The lifecycle action (`kind: 'transition'`). */
  action?: string;
  /** The row before the write (update, transition, delete). */
  before?: BaseRecordRow;
}

/**
 * A table's own business rules, kept in its hand-written `<table>.rules.ts` and spread into the
 * generated service — so regenerating a table never loses them.
 *
 * @remarks
 * - **Notes:** every hook runs inside the write's transaction (the organization context), so a
 *   side effect on another table commits or rolls back with the write. Values are column values
 *   (references already resolved to ids). Throw a typed error to refuse the write.
 */
export interface BaseRecordRules {
  /**
   * The rows a caller may read at all, as `column → allowed values` (the Private album only for
   * its holders) — applied to every list, read, write and restore by id; an internal call (no
   * `can`) reads everything.
   */
  readScope?: (
    can: (code: string) => Promise<boolean>,
  ) => Promise<Readonly<Record<string, readonly unknown[]>> | undefined>;
  /** Fills or checks a create's values before the insert (defaults by rule, cross-table checks). */
  prepareCreate?: (
    values: Record<string, unknown>,
    context: BaseRecordWriteContext,
  ) => Promise<void> | void;
  /** Checks a delete before it is written (a group that still holds live offerings — O7). */
  prepareRemove?: (
    existing: BaseRecordRow,
    context: BaseRecordWriteContext,
  ) => Promise<void> | void;
  /**
   * Checks a restore before it is written — `deleted` is the soft-deleted row (a contact that
   * already has another open lead — L6).
   */
  prepareRestore?: (
    deleted: BaseRecordRow,
    context: BaseRecordWriteContext,
  ) => Promise<void> | void;
  /** Fills or checks an update's values before the write; `existing` is the row as it was. */
  prepareUpdate?: (
    values: Record<string, unknown>,
    existing: BaseRecordRow,
    context: BaseRecordWriteContext,
  ) => Promise<void> | void;
  /** Fills or checks a lifecycle action's values before the write. */
  prepareTransition?: (
    action: string,
    values: Record<string, unknown>,
    existing: BaseRecordRow,
    context: BaseRecordWriteContext,
  ) => Promise<void> | void;
  /**
   * Adds the per-viewer fields a read answers with (`is_unread`) — runs on every list, get and
   * write response, inside the read's organization context.
   */
  decorate?: (
    outputs: Record<string, unknown>[],
    context: BaseRecordWriteContext,
  ) => Promise<void> | void;
  /**
   * Record actions with their own logic (`POST /app/<module>/{id}/<name>`) — beyond a status
   * change: claim a lead, mark it read. Returns the row to answer with (changed or not).
   */
  actions?: Readonly<Record<string, (input: BaseRecordActionInput) => Promise<BaseRecordRow>>>;
  /** Read views of one record (`GET /app/<module>/{id}/<name>`) — a timeline, an account. */
  views?: Readonly<Record<string, (input: BaseRecordActionInput) => Promise<unknown>>>;
  /** Writes on the collection (`POST /app/<module>/<name>`) — bulk messages, discounts. */
  collectionActions?: Readonly<
    Record<string, (input: BaseRecordCollectionInput) => Promise<unknown>>
  >;
  /** Reads of the collection (`GET /app/<module>/<name>`) — available slots, day counts. */
  collectionViews?: Readonly<
    Record<string, (input: BaseRecordCollectionInput) => Promise<unknown>>
  >;
  /** The side effects of a committed-together write (stock moves, counters, follow-up rows). */
  afterWrite?: (
    row: BaseRecordRow,
    change: BaseRecordChange,
    context: BaseRecordWriteContext,
  ) => Promise<void> | void;
}

/** What a record action or view gets: the live row, the request and where it runs. */
export interface BaseRecordActionInput {
  existing: BaseRecordRow;
  /** The parsed body (actions) or query (views). */
  input: Record<string, unknown>;
  context: BaseRecordWriteContext;
  visibility: BaseRecordVisibility | undefined;
  /** The table's repository — for the action's own write. */
  repository: BaseRecordRepository;
  /** Shapes rows as the table's routes answer them (serializer + per-viewer fields). */
  present: (rows: BaseRecordRow[]) => Promise<unknown[]>;
}

/** What a collection action or view gets: the request and where it runs. */
export interface BaseRecordCollectionInput {
  /** The parsed body (actions) or query (views). */
  input: Record<string, unknown>;
  context: BaseRecordWriteContext;
  visibility: BaseRecordVisibility | undefined;
  repository: BaseRecordRepository;
  /** Shapes rows as the table's routes answer them (serializer + per-viewer fields). */
  present: (rows: BaseRecordRow[]) => Promise<unknown[]>;
  /**
   * The caller's branch condition, as a list applies it — the requested branches (public ids)
   * within the caller's own (D9); `undefined` when the caller sees every branch and picked none.
   */
  branchScope: (
    requested?: readonly string[],
  ) => Promise<{ column: string; ids: readonly number[] } | undefined>;
  /**
   * Swaps the table's reference fields in `values` (public ids) for their internal ids, as a
   * write does — 400 on an id that is not in the organization.
   */
  resolveReferences: (values: Record<string, unknown>) => Promise<void>;
}

/** Everything that makes one table's service differ from another's. */
export interface BaseRecordDescriptor<Output> extends BaseRecordRules {
  /** The 404 name (`Offering`). */
  label: string;
  repository: BaseRecordRepository;
  /**
   * The `DELETE` query when the record has its own reasons (an order's cancel, a sale's void —
   * `recordDeleteQuerySchemaOf`); the standard reasons otherwise.
   */
  deleteQuery?: ZodType<{ reason: string; note?: string | undefined }>;
  parseCreate: (body: unknown) => Record<string, unknown>;
  /**
   * Creates of their own body, one route each (`POST …/send-message`, `…/log-call`): name → parser.
   * The rest of the create — references, rules, conflicts — is the table's.
   */
  namedCreates?: Readonly<Record<string, (body: unknown) => Record<string, unknown>>>;
  parseUpdate: (body: unknown) => Record<string, unknown>;
  parseList: (query: unknown) => BaseRecordListInput;
  serialize: (row: BaseRecordRow, references: BaseRecordReferenceLookup) => Output;
  references?: readonly BaseRecordReference[];
  referenceLists?: readonly BaseRecordReferenceList[];
  childLists?: readonly BaseRecordChildList[];
  parent?: BaseRecordParent;
  /**
   * Unique index or exclusion constraint name → the 409's message key, or the key and its `reason`
   * code (`{ key, reason: 'contact_phone_exists' }`).
   */
  conflicts?: Readonly<Record<string, string | { key: string; reason: string }>>;
  /** Cross-field rules on the values a write would leave (create values, or row + update). */
  checkValues?: (values: Record<string, unknown>) => void;
  /**
   * What a list adds to its `meta` beside the paging, from the query as resolved (a purchase list's
   * `due_total` over every page).
   */
  listMeta?: (options: {
    organizationId: number;
    query: BaseRecordListQuery;
  }) => Promise<Readonly<Record<string, unknown>>>;
  transitions?: Readonly<Record<string, BaseRecordTransition>>;
  /**
   * The column naming the member a record belongs to (a doctor's prescription kits, P17): a create
   * sets it to the caller's membership (a caller who is not a member is a 403 `not_a_member`);
   * every list, read, write and restore sees only the caller's own rows (404 otherwise).
   */
  ownerMembershipColumn?: string;
  /**
   * The column naming the record's branch — a caller without every branch sees and writes only
   * rows of their branches, or of no branch (D9).
   */
  branchColumn?: string;
}

/** A list page as the controller answers it. */
export interface BaseRecordListResult<Output> {
  items: Output[];
  /** The capped total on the first page; null on later pages and when skipped. */
  total: number | null;
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
  /** What the list adds to the response's `meta` beside the paging (a photo list's `album_counts`). */
  meta?: Readonly<Record<string, unknown>>;
}

/**
 * A list download (`GET /app/<module>/exports`) — the CSV inside the JSON envelope, so the
 * client saves it as a file (D18 "Export lists").
 *
 * @remarks
 * - **Notes:** at most {@link BASE_RECORD_EXPORT_ROW_LIMIT} rows; `is_truncated` says when more matched.
 */
export interface BaseRecordExportOutput {
  file_name: string;
  content_type: 'text/csv';
  row_count: number;
  is_truncated: boolean;
  content: string;
}

/** The most rows one export carries. */
export const BASE_RECORD_EXPORT_ROW_LIMIT = 5000;
