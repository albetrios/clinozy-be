import type { PgTable } from 'drizzle-orm/pg-core';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import {
  ConflictError,
  fieldValidationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors/index.js';
import {
  getPostgresConstraintName,
  isPostgresExclusionViolation,
  isPostgresUniqueViolation,
} from '@/shared/utils/infrastructure/postgres-error.util.js';
import {
  assertRecordNotChangedSince,
  recordDeleteQuerySchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  type BaseRecordLinkFilter,
  type BaseRecordPage,
  type BaseRecordRow,
  findMembershipIdOfUser,
  listChildRows,
  listLinkedPublicIds,
  listVisibleBranchIds,
  replaceChildRows,
  replaceLinkedIds,
  resolveRecordIds,
  resolveRecordPublicIds,
} from './base-record.repository.js';
import type {
  BaseRecordChildList,
  BaseRecordConfirmedUpload,
  BaseRecordDescriptor,
  BaseRecordListInput,
  BaseRecordListResult,
  BaseRecordReferenceList,
  BaseRecordReferenceLookup,
  BaseRecordActionInput,
  BaseRecordPorts,
  BaseRecordVisibility,
  BaseRecordWriteContext,
} from './base-record.types.js';
import { BASE_RECORD_EXPORT_ROW_LIMIT } from './base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';

/**
 * The base service every `app.*` record extends: list, get, create, update, soft-delete with a reason,
 * restore and lifecycle actions, inside the caller's organization context.
 *
 * @remarks
 * - **Algorithm:** each call runs in `withAppDatabaseContext` (organization scope), resolves the
 *   organization and the acting user, turns referenced public ids into ids (a 400 naming the
 *   field when one is no live record here), writes through the table's repository and its link
 *   tables, and serializes with the referenced public ids batch-read for the page.
 * - **Failure modes:** `NotFoundError(label)`; `ValidationError` for a bad body or reference;
 *   `ConflictError` for a unique clash, a record changed since it was opened (`expected_updated_at`,
 *   D43), an action its status does not allow, or a restore of a live record.
 * - **Side effects:** writes stamp the acting user; a delete keeps the row (purged later, D38).
 */
export class BaseRecordService<Output> {
  constructor(
    protected readonly organizationService: OrganizationService,
    protected readonly descriptor: BaseRecordDescriptor<Output>,
  ) {}

  /** The ports rules call outside the app records — set by the app container ({@link usePorts}). */
  protected ports: BaseRecordPorts = UNWIRED_PORTS;

  /** Wires the ports (once, from the app container). */
  usePorts(ports: BaseRecordPorts): void {
    this.ports = ports;
  }

  /** The context a write or a rule runs with. */
  protected writeContext({
    scope,
    organizationId,
    userId,
    visibility,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    organizationId: number;
    userId: number | null;
    visibility?: BaseRecordVisibility | undefined;
  }): BaseRecordWriteContext {
    return {
      scope,
      organizationId,
      userId,
      ports: this.ports,
      can: visibility?.can ?? (async () => true),
    };
  }

  /** Whether this table's rows belong to a branch (reads and writes follow D9 visibility). */
  get branchScoped(): boolean {
    return this.descriptor.branchColumn !== undefined;
  }

  /** One page of the organization's live records (under the parent when nested). */
  async list({
    scope,
    query,
    options = {},
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    query: unknown;
    options?: {
      parentPublicId?: string | undefined;
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
      /** `false` skips the COUNT — for internal readers that never show a total. */
      withTotal?: boolean | undefined;
      /** Reference filters by many public ids (`{ patient_id: [pat_…] }`) — one `IN`, internal only. */
      referenceIn?: Readonly<Record<string, readonly string[]>> | undefined;
      /** Derived filters the service adds beside the query's (the caller's queues — a task's `mine`). */
      derived?: Readonly<Record<string, unknown>> | undefined;
    };
  }): Promise<BaseRecordListResult<Output>> {
    const parsed = this.descriptor.parseList(query);
    const input = options.derived
      ? { ...parsed, derived: { ...parsed.derived, ...options.derived } }
      : parsed;
    const parentPublicId = options.parentPublicId;
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const equals: Record<string, unknown> = { ...(input.equals ?? {}) };
        if (
          !(await this.resolveReferenceIn({
            organizationId,
            referenceIn: options.referenceIn,
            equals,
          }))
        ) {
          return emptyPage(input.limit);
        }
        if (
          !(await this.narrowToOwner({
            organizationId,
            actingUserPublicId: options.actingUserPublicId,
            equals,
          }))
        ) {
          return emptyPage(input.limit);
        }
        const { parent } = this.descriptor;
        if (parent && parentPublicId !== undefined) {
          equals[parent.field] = await this.requireVisibleParentId({
            organizationId,
            parentPublicId,
            userId: await this.userId(options.actingUserPublicId),
            visibility: options.visibility,
          });
        }
        // TRC3: the path's parent wins over the same filter in the query
        const filters =
          parent && parentPublicId !== undefined
            ? { ...input, referenceEquals: { ...input.referenceEquals, [parent.field]: undefined } }
            : input;
        const linked = await this.resolveReferenceFilters({
          organizationId,
          input: filters,
          equals,
        });
        if (!linked) return emptyPage(input.limit);
        if (!(await this.narrowToReadScope({ visibility: options.visibility, equals }))) {
          return emptyPage(input.limit);
        }
        const branchScope = await this.branchScope({
          organizationId,
          actingUserPublicId: options.actingUserPublicId,
          visibility: options.visibility,
          requested: input.branchPublicIds,
        });
        const listQuery = { ...input, equals, branchScope, linked, withTotal: options.withTotal };
        const page: BaseRecordPage = await this.descriptor.repository.list(
          organizationId,
          listQuery,
        );
        const meta = await this.descriptor.listMeta?.({ organizationId, query: listQuery });
        const items = await this.serializeRows({ rows: page.items });
        await this.decorate({
          outputs: items,
          context: this.writeContext({
            scope,
            organizationId,
            userId: await this.userId(options.actingUserPublicId),
            visibility: options.visibility,
          }),
        });
        return { ...page, items, ...(meta ? { meta } : {}) };
      },
    });
  }

  /**
   * Internal reference filters by many public ids, into `equals` (one `IN` per field); false when a
   * field names no record here (the page is empty).
   */
  private async resolveReferenceIn({
    organizationId,
    referenceIn,
    equals,
  }: {
    organizationId: number;
    referenceIn: Readonly<Record<string, readonly string[]>> | undefined;
    equals: Record<string, unknown>;
  }): Promise<boolean> {
    for (const [field, publicIds] of Object.entries(referenceIn ?? {})) {
      const ids = await resolveRecordIds({
        table: this.referenceTable(field),
        organizationId,
        publicIds: [...publicIds],
      });
      if (ids.size === 0) return false;
      equals[field] = [...ids.values()];
    }
    return true;
  }

  /**
   * A list query's reference filters (into `equals`) and link filters (returned) by public id; null
   * when one names no record here (the page is empty).
   */
  private async resolveReferenceFilters({
    organizationId,
    input,
    equals,
  }: {
    organizationId: number;
    input: BaseRecordListInput;
    equals: Record<string, unknown>;
  }): Promise<BaseRecordLinkFilter[] | null> {
    for (const [field, publicId] of Object.entries(input.referenceEquals ?? {})) {
      if (publicId === undefined) continue;
      const table = this.referenceTable(field);
      const ids = await resolveRecordIds({ table, organizationId, publicIds: [publicId] });
      const id = ids.get(publicId);
      if (id === undefined) return null;
      equals[field] = id;
    }
    const linked: BaseRecordLinkFilter[] = [];
    for (const [field, publicId] of Object.entries(input.linkEquals ?? {})) {
      if (publicId === undefined) continue;
      const list = this.referenceList(field);
      const ids = await resolveRecordIds({
        table: list.link.targetTable,
        organizationId,
        publicIds: [publicId],
      });
      const targetId = ids.get(publicId);
      if (targetId === undefined) return null;
      linked.push({ link: list.link, targetId, orUnlinked: list.emptyMeansEvery === true });
    }
    return linked;
  }

  /** One live record. */
  async get({
    scope,
    publicId,
    actingUserPublicId,
    visibility,
    parentPublicId,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    publicId: string;
    actingUserPublicId?: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    parentPublicId?: string | undefined;
  }): Promise<Output> {
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(actingUserPublicId);
        const row = await this.requireRow({ organizationId, publicId, userId, visibility });
        await this.assertUnderParent({ organizationId, row, parentPublicId, userId, visibility });
        return this.serializeOne({
          row,
          context: this.writeContext({ scope, organizationId, userId, visibility }),
        });
      },
    });
  }

  /**
   * Creates a record (under the parent when nested) — with the table's create body, or with one of
   * its named creates (`createName`, one route per action — `send-message`, `add-note`).
   */
  async create({
    scope,
    body,
    actingUserPublicId,
    parentPublicId,
    visibility,
    createName,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    actingUserPublicId: string | undefined;
    parentPublicId?: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    createName?: string | undefined;
  }): Promise<Output> {
    const parse =
      createName === undefined
        ? this.descriptor.parseCreate
        : this.descriptor.namedCreates?.[createName];
    if (!parse) throw new NotFoundError(this.descriptor.label);
    const parsed = parse(body);
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(actingUserPublicId);
        const values: Record<string, unknown> = { ...parsed };
        const { parent } = this.descriptor;
        if (parent && parentPublicId !== undefined) {
          values[parent.field] = await this.requireVisibleParentId({
            organizationId,
            parentPublicId,
            userId,
            visibility,
          });
        }
        await this.resolveReferences({ organizationId, values });
        await this.assertBranchWritable({ organizationId, userId, visibility, values });
        const ownerColumn = this.descriptor.ownerMembershipColumn;
        if (ownerColumn !== undefined) {
          const membershipId = await findMembershipIdOfUser({ organizationId, userId });
          if (membershipId === null) {
            throw new ForbiddenError('errors:forbidden').withReason('not_a_member');
          }
          values[ownerColumn] = membershipId;
        }
        const lists = await this.takeReferenceLists({ organizationId, values });
        const context = this.writeContext({ scope, organizationId, userId, visibility });
        await this.descriptor.prepareCreate?.(values, context);
        this.descriptor.checkValues?.(values);
        const children = this.takeChildLists(values);
        const row = await this.mapConflicts(() =>
          this.descriptor.repository.insert({
            ...values,
            organization_id: organizationId,
            created_by_user_id: userId,
            updated_by_user_id: userId,
          }),
        );
        await this.writeReferenceLists({ organizationId, ownerId: row.id, lists, userId });
        await this.writeChildLists({ owner: row, children });
        await this.descriptor.afterWrite?.(row, { kind: 'create' }, context);
        return this.serializeOne({ row, context });
      },
    });
  }

  /** Changes a live record; refuses a stale save (`expected_updated_at`, D43). */
  async update({
    scope,
    publicId,
    body,
    actingUserPublicId,
    visibility,
    parentPublicId,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    publicId: string;
    body: unknown;
    actingUserPublicId: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    parentPublicId?: string | undefined;
  }): Promise<Output> {
    const { expected_updated_at: expectedUpdatedAt, ...parsed } = this.descriptor.parseUpdate(body);
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(actingUserPublicId);
        const existing = await this.requireRow({ organizationId, publicId, userId, visibility });
        await this.assertUnderParent({
          organizationId,
          row: existing,
          parentPublicId,
          userId,
          visibility,
        });
        await this.assertNotChangedSince({ row: existing, expected: expectedUpdatedAt });
        const values: Record<string, unknown> = { ...parsed };
        await this.resolveReferences({ organizationId, values });
        await this.assertBranchWritable({ organizationId, userId, visibility, values });
        const lists = await this.takeReferenceLists({ organizationId, values });
        const context = this.writeContext({ scope, organizationId, userId, visibility });
        await this.descriptor.prepareUpdate?.(values, existing, context);
        this.descriptor.checkValues?.({ ...existing, ...values });
        const children = this.takeChildLists(values);
        const updated = await this.mapConflicts(() =>
          this.descriptor.repository.update(existing.id, values, userId),
        );
        if (!updated) throw new NotFoundError(this.descriptor.label);
        await this.writeReferenceLists({ organizationId, ownerId: updated.id, lists, userId });
        await this.writeChildLists({ owner: updated, children });
        await this.descriptor.afterWrite?.(updated, { kind: 'update', before: existing }, context);
        return this.serializeOne({ row: updated, context });
      },
    });
  }

  /**
   * Runs a lifecycle action (`cancel`, `approve`, …) if the record's status allows it — under the
   * parent when the route is nested (`…/{contact_id}/activities/{contact_activity_id}/resend`).
   */
  async transition({
    scope,
    publicId,
    action,
    body,
    actingUserPublicId,
    visibility,
    parentPublicId,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    publicId: string;
    action: string;
    body: unknown;
    actingUserPublicId: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    parentPublicId?: string | undefined;
  }): Promise<Output> {
    const custom = this.descriptor.actions?.[action];
    if (custom) {
      return this.runAction({
        scope,
        publicId,
        action,
        body,
        actingUserPublicId,
        visibility,
        parentPublicId,
        run: custom,
      });
    }
    const transition = this.descriptor.transitions?.[action];
    if (!transition) throw new NotFoundError(this.descriptor.label);
    const extra = transition.parse ? transition.parse(body) : {};
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(actingUserPublicId);
        const existing = await this.requireRow({ organizationId, publicId, userId, visibility });
        await this.assertUnderParent({
          organizationId,
          row: existing,
          parentPublicId,
          userId,
          visibility,
        });
        const statusColumn = transition.statusColumn ?? 'status';
        const currentStatus = existing[statusColumn];
        const status = typeof currentStatus === 'string' ? currentStatus : '';
        if (transition.from && !transition.from.includes(status)) {
          throw new ConflictError('errors:recordTransitionNotAllowed', {
            action,
            status,
          }).withReason('transition_not_allowed');
        }
        const values: Record<string, unknown> = { ...(transition.set ?? {}), ...extra };
        for (const column of transition.stamp ?? []) values[column] = new Date();
        await this.resolveReferences({ organizationId, values });
        const context = this.writeContext({ scope, organizationId, userId, visibility });
        await this.descriptor.prepareTransition?.(action, values, existing, context);
        this.descriptor.checkValues?.({ ...existing, ...values });
        const updated = await this.mapConflicts(() =>
          this.descriptor.repository.update(existing.id, values, userId),
        );
        if (!updated) throw new NotFoundError(this.descriptor.label);
        await this.descriptor.afterWrite?.(
          updated,
          { kind: 'transition', action, before: existing },
          context,
        );
        return this.serializeOne({ row: updated, context });
      },
    });
  }

  /** Soft-deletes a record with why (`?reason=&note=`). */
  async remove({
    scope,
    publicId,
    query,
    actingUserPublicId,
    visibility,
    parentPublicId,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    publicId: string;
    query: unknown;
    actingUserPublicId: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    parentPublicId?: string | undefined;
  }): Promise<void> {
    const removal = parseWithSchema<{ reason: string; note?: string | undefined }>({
      schema: this.descriptor.deleteQuery ?? recordDeleteQuerySchema,
      data: query,
    });
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(actingUserPublicId);
        const existing = await this.requireRow({ organizationId, publicId, userId, visibility });
        await this.assertUnderParent({
          organizationId,
          row: existing,
          parentPublicId,
          userId,
          visibility,
        });
        await this.descriptor.prepareRemove?.(
          existing,
          this.writeContext({ scope, organizationId, userId, visibility }),
        );
        const deleted = await this.descriptor.repository.softDelete(
          existing.id,
          { delete_reason: removal.reason, delete_note: removal.note ?? null },
          userId,
        );
        if (!deleted) throw new NotFoundError(this.descriptor.label);
        await this.descriptor.afterWrite?.(
          deleted,
          { kind: 'delete', before: existing },
          this.writeContext({ scope, organizationId, userId, visibility }),
        );
      },
    });
  }

  /** A record action with its own logic (a table rule), audited by the controller like any other. */
  private async runAction(options: {
    scope: OrganizationPrincipalDatabaseScope;
    publicId: string;
    action: string;
    body: unknown;
    actingUserPublicId: string | undefined;
    visibility: BaseRecordVisibility | undefined;
    parentPublicId: string | undefined;
    run: (input: BaseRecordActionInput) => Promise<BaseRecordRow>;
  }): Promise<Output> {
    const { scope } = options;
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(options.actingUserPublicId);
        const existing = await this.requireRow({
          organizationId,
          publicId: options.publicId,
          userId,
          visibility: options.visibility,
        });
        await this.assertUnderParent({
          organizationId,
          row: existing,
          parentPublicId: options.parentPublicId,
          userId,
          visibility: options.visibility,
        });
        const context = this.writeContext({
          scope,
          organizationId,
          userId,
          visibility: options.visibility,
        });
        const row = await options.run({
          existing,
          input: (options.body ?? {}) as Record<string, unknown>,
          context,
          visibility: options.visibility,
          repository: this.descriptor.repository,
          present: (rows) =>
            this.present({
              rows,
              context: this.writeContext({
                scope,
                organizationId,
                userId,
                visibility: options.visibility,
              }),
            }),
        });
        await this.descriptor.afterWrite?.(
          row,
          { kind: 'transition', action: options.action, before: existing },
          context,
        );
        return this.serializeOne({ row, context });
      },
    });
  }

  /** A read view of one record (`GET …/{id}/<view>`). */
  async view({
    scope,
    publicId,
    name,
    query,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    publicId: string;
    name: string;
    query: unknown;
    options: {
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
    };
  }): Promise<unknown> {
    const run = this.descriptor.views?.[name];
    if (!run) throw new NotFoundError(this.descriptor.label);
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(options.actingUserPublicId);
        const existing = await this.requireRow({
          organizationId,
          publicId,
          userId,
          visibility: options.visibility,
        });
        return run({
          existing,
          input: (query ?? {}) as Record<string, unknown>,
          context: this.writeContext({
            scope,
            organizationId,
            userId,
            visibility: options.visibility,
          }),
          visibility: options.visibility,
          repository: this.descriptor.repository,
          present: (rows) =>
            this.present({
              rows,
              context: this.writeContext({
                scope,
                organizationId,
                userId,
                visibility: options.visibility,
              }),
            }),
        });
      },
    });
  }

  /** A collection action (`POST /<module>/<name>`) or view (`GET /<module>/<name>`). */
  async collection({
    scope,
    kind,
    name,
    input,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    kind: 'action' | 'view';
    name: string;
    input: unknown;
    options: {
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
    };
  }): Promise<unknown> {
    const run = (
      kind === 'action' ? this.descriptor.collectionActions : this.descriptor.collectionViews
    )?.[name];
    if (!run) throw new NotFoundError(this.descriptor.label);
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(options.actingUserPublicId);
        return run({
          input: (input ?? {}) as Record<string, unknown>,
          context: this.writeContext({
            scope,
            organizationId,
            userId,
            visibility: options.visibility,
          }),
          visibility: options.visibility,
          repository: this.descriptor.repository,
          present: (rows) =>
            this.present({
              rows,
              context: this.writeContext({
                scope,
                organizationId,
                userId,
                visibility: options.visibility,
              }),
            }),
          branchScope: (requested) =>
            this.branchScope({
              organizationId,
              actingUserPublicId: options.actingUserPublicId,
              visibility: options.visibility,
              requested,
            }),
          resolveReferences: (values) => this.resolveReferences({ organizationId, values }),
        });
      },
    });
  }

  /** Serializes rows for a rule's answer, with the per-viewer fields (for collection results). */
  async present({
    rows,
    context,
  }: {
    rows: BaseRecordRow[];
    context: BaseRecordWriteContext;
  }): Promise<Output[]> {
    const outputs = await this.serializeRows({ rows });
    await this.decorate({ outputs, context });
    return outputs;
  }

  /** Undoes a soft delete within the restore window. */
  async restore({
    scope,
    publicId,
    actingUserPublicId,
    visibility,
    parentPublicId,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    publicId: string;
    actingUserPublicId: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    parentPublicId?: string | undefined;
  }): Promise<Output> {
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const { repository } = this.descriptor;
        const deleted = await repository.findByPublicId(publicId, organizationId, {
          deleted: true,
        });
        if (
          deleted &&
          !(await this.isRowVisible({
            organizationId,
            row: deleted,
            actingUserPublicId,
            visibility,
          }))
        ) {
          throw new NotFoundError(this.descriptor.label);
        }
        const live = deleted ? null : await repository.findByPublicId(publicId, organizationId);
        const found = deleted ?? live;
        if (found) {
          await this.assertUnderParent({
            organizationId,
            row: found,
            parentPublicId,
            userId: await this.userId(actingUserPublicId),
            visibility,
          });
        }
        if (!deleted) {
          if (live) {
            throw new ConflictError('errors:recordNotDeleted').withReason('record_not_deleted');
          }
          throw new NotFoundError(this.descriptor.label);
        }
        const userId = await this.userId(actingUserPublicId);
        await this.descriptor.prepareRestore?.(
          deleted,
          this.writeContext({ scope, organizationId, userId, visibility }),
        );
        let restored: BaseRecordRow | null;
        try {
          restored = await repository.restore(deleted.id, userId);
        } catch (error) {
          if (isPostgresUniqueViolation(error)) {
            throw new ConflictError('errors:recordRestoreConflict').withReason(
              'record_restore_conflict',
            );
          }
          // A table's own exclusion conflict (a slot booked meanwhile — `slot_taken`, A3).
          restored = await this.mapConflicts<BaseRecordRow | null>(async () => {
            throw error;
          });
        }
        if (!restored) throw new NotFoundError(this.descriptor.label);
        // A rule's own restore writes (a contact's numbers) may clash too — the table's 409, not a 500.
        await this.mapConflicts(async () =>
          this.descriptor.afterWrite?.(
            restored,
            { kind: 'restore' },
            this.writeContext({ scope, organizationId, userId, visibility }),
          ),
        );
        return this.serializeOne({
          row: restored,
          context: this.writeContext({ scope, organizationId, userId, visibility }),
        });
      },
    });
  }

  /**
   * Serializes rows with their references' public ids read in one batch per field — and, for a
   * single-record response (`withChildren`), their child lists.
   */
  protected async serializeRows({
    rows,
    options = {},
  }: {
    rows: BaseRecordRow[];
    options?: { withChildren?: boolean } | undefined;
  }): Promise<Output[]> {
    const references = [
      ...(this.descriptor.references ?? []),
      ...(this.descriptor.parent ? [this.descriptor.parent] : []),
    ];
    const publicIds = new Map<string, Map<number, string>>();
    for (const reference of references) {
      const ids = rows.flatMap((row) =>
        typeof row[reference.field] === 'number' ? [row[reference.field] as number] : [],
      );
      publicIds.set(reference.field, await resolveRecordPublicIds({ table: reference.table, ids }));
    }
    const lists = new Map<string, Map<number, string[]>>();
    for (const list of this.descriptor.referenceLists ?? []) {
      lists.set(
        list.field,
        await listLinkedPublicIds({ link: list.link, ownerIds: rows.map((row) => row.id) }),
      );
    }
    const children = new Map<string, Map<number, Record<string, unknown>[]>>();
    if (options.withChildren) {
      for (const child of this.descriptor.childLists ?? []) {
        children.set(
          child.field,
          await listChildRows({ child, ownerIds: rows.map((row) => row.id) }),
        );
      }
    }
    const lookup: BaseRecordReferenceLookup = {
      publicIdOf: ({ field, row }) => {
        const value = row[field];
        return typeof value === 'number' ? (publicIds.get(field)?.get(value) ?? null) : null;
      },
      listOf: ({ field, row }) => lists.get(field)?.get(row.id) ?? [],
      childrenOf: ({ field, row }) => {
        const byOwner = children.get(field);
        return byOwner ? (byOwner.get(row.id) ?? []) : undefined;
      },
    };
    return rows.map((row) => this.descriptor.serialize({ row, references: lookup }));
  }

  /** Serializes one row, with the per-viewer fields when the caller is known. */
  protected async serializeOne({
    row,
    context,
  }: {
    row: BaseRecordRow;
    context?: BaseRecordWriteContext | undefined;
  }): Promise<Output> {
    const [output] = await this.serializeRows({ rows: [row], options: { withChildren: true } });
    if (context) await this.decorate({ outputs: [output!], context });
    return output!;
  }

  /** Adds the table's per-viewer fields ({@link BaseRecordRules.decorate}). */
  private async decorate({
    outputs,
    context,
  }: {
    outputs: Output[];
    context: BaseRecordWriteContext;
  }): Promise<void> {
    if (!this.descriptor.decorate || outputs.length === 0) return;
    await this.descriptor.decorate(outputs as unknown as Record<string, unknown>[], context);
  }

  /**
   * Every row a list query matches, for a download — up to {@link BASE_RECORD_EXPORT_ROW_LIMIT},
   * paging through the list (its filters, sort, visibility and rules, and the route's own derived
   * filters — a store's slice of the ledger).
   */
  async exportRows({
    scope,
    query,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    query: unknown;
    options: {
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
      /** Derived filters the route adds beside the query's (as {@link BaseRecordService.list}). */
      derived?: Readonly<Record<string, unknown>> | undefined;
    };
  }): Promise<{ rows: Output[]; is_truncated: boolean }> {
    const { after: _after, limit: _limit, ...filters } = (query ?? {}) as Record<string, unknown>;
    const rows: Output[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await this.list({
        scope,
        query: { ...filters, limit: EXPORT_PAGE_SIZE, ...(after === undefined ? {} : { after }) },
        options: { ...options, withTotal: false },
      });
      rows.push(...page.items);
      if (rows.length >= BASE_RECORD_EXPORT_ROW_LIMIT) {
        return {
          rows: rows.slice(0, BASE_RECORD_EXPORT_ROW_LIMIT),
          is_truncated: page.has_more || rows.length > BASE_RECORD_EXPORT_ROW_LIMIT,
        };
      }
      if (!(page.has_more && page.next_cursor)) return { rows, is_truncated: false };
      after = page.next_cursor;
    }
  }

  /** The active organization's internal id. */
  protected async organizationId(scope: OrganizationPrincipalDatabaseScope): Promise<number> {
    const organization = await this.organizationService.requireOrganizationByPublicId(
      scope.organizationPublicId,
    );
    return organization.id;
  }

  /** The acting user's internal id (null for an API key). */
  protected async userId(actingUserPublicId: string | undefined): Promise<number | null> {
    return (
      (await this.organizationService.resolveUserInternalIdByPublicId(actingUserPublicId)) ?? null
    );
  }

  /** A live row of the organization by public id (the actor's own, when owned); 404 otherwise. */
  protected async requireRow({
    organizationId,
    publicId,
    userId,
    visibility,
  }: {
    organizationId: number;
    publicId: string;
    userId: number | null;
    visibility?: BaseRecordVisibility | undefined;
  }): Promise<BaseRecordRow> {
    const row = await this.descriptor.repository.findByPublicId(publicId, organizationId);
    if (!row) throw new NotFoundError(this.descriptor.label);
    if (!(await this.isOwnersRow({ organizationId, row, userId }))) {
      throw new NotFoundError(this.descriptor.label);
    }
    const visible = await this.visibleBranchIds({ organizationId, userId, visibility });
    if (!branchAllowed({ branchId: row[this.descriptor.branchColumn ?? ''], visible })) {
      throw new NotFoundError(this.descriptor.label);
    }
    if (!readScopeAllows({ row, scope: await this.readScopeOf(visibility) })) {
      throw new NotFoundError(this.descriptor.label);
    }
    return row;
  }

  /** The table's read scope for this caller (see {@link BaseRecordRules.readScope}). */
  private async readScopeOf(
    visibility: BaseRecordVisibility | undefined,
  ): Promise<Readonly<Record<string, readonly unknown[]>> | undefined> {
    if (!(this.descriptor.readScope && visibility?.can)) return undefined;
    return this.descriptor.readScope(visibility.can);
  }

  /**
   * Narrows a list to the caller's own rows on a table of each member's own records
   * ({@link BaseRecordDescriptor.ownerMembershipColumn}) — false when the caller is no member (an
   * empty page); true, unchanged, on any other table.
   */
  private async narrowToOwner({
    organizationId,
    actingUserPublicId,
    equals,
  }: {
    organizationId: number;
    actingUserPublicId: string | undefined;
    equals: Record<string, unknown>;
  }): Promise<boolean> {
    const ownerColumn = this.descriptor.ownerMembershipColumn;
    if (ownerColumn === undefined) return true;
    const membershipId = await findMembershipIdOfUser({
      organizationId,
      userId: await this.userId(actingUserPublicId),
    });
    if (membershipId === null) return false;
    equals[ownerColumn] = membershipId;
    return true;
  }

  /**
   * Narrows a list's equality filters to the caller's read scope ({@link BaseRecordRules.readScope})
   * — false when a requested value is outside it (an empty page).
   */
  private async narrowToReadScope({
    visibility,
    equals,
  }: {
    visibility: BaseRecordVisibility | undefined;
    equals: Record<string, unknown>;
  }): Promise<boolean> {
    const readScope = await this.readScopeOf(visibility);
    for (const [field, allowed] of Object.entries(readScope ?? {})) {
      const requested = equals[field];
      const requestedValues = Array.isArray(requested) ? requested : [requested];
      const kept =
        requested === undefined
          ? [...allowed]
          : requestedValues.filter((value) => allowed.includes(value));
      if (kept.length === 0) return false;
      equals[field] = kept;
    }
    return true;
  }

  /**
   * Whether a row is the caller's own on a table of each member's own records
   * ({@link BaseRecordDescriptor.ownerMembershipColumn}) — always true on any other table.
   */
  private async isOwnersRow(options: {
    organizationId: number;
    row: BaseRecordRow;
    userId: number | null;
  }): Promise<boolean> {
    const ownerColumn = this.descriptor.ownerMembershipColumn;
    if (ownerColumn === undefined) return true;
    const membershipId = await findMembershipIdOfUser({
      organizationId: options.organizationId,
      userId: options.userId,
    });
    return membershipId !== null && options.row[ownerColumn] === membershipId;
  }

  /** Whether a (deleted) row is the caller's to see — its branches, read scope, owner (the restore check). */
  private async isRowVisible(options: {
    organizationId: number;
    row: BaseRecordRow;
    actingUserPublicId: string | undefined;
    visibility: BaseRecordVisibility | undefined;
  }): Promise<boolean> {
    const userId = await this.userId(options.actingUserPublicId);
    const visible = await this.visibleBranchIds({
      organizationId: options.organizationId,
      userId,
      visibility: options.visibility,
    });
    return (
      branchAllowed({ branchId: options.row[this.descriptor.branchColumn ?? ''], visible }) &&
      readScopeAllows({ row: options.row, scope: await this.readScopeOf(options.visibility) }) &&
      (await this.isOwnersRow({ organizationId: options.organizationId, row: options.row, userId }))
    );
  }

  /**
   * The branch ids the caller may see on this table, or `null` for no limit — a table without a
   * branch column, a caller with every branch, or an internal call (D9).
   */
  protected async visibleBranchIds(options: {
    organizationId: number;
    userId: number | null;
    visibility: BaseRecordVisibility | undefined;
  }): Promise<readonly number[] | null> {
    if (!(this.descriptor.branchColumn && options.visibility) || options.visibility.allBranches) {
      return null;
    }
    if (options.userId === null) return [];
    return listVisibleBranchIds({ organizationId: options.organizationId, userId: options.userId });
  }

  /** The list's branch condition: the picker's branches within the caller's (D9). */
  private async branchScope(options: {
    organizationId: number;
    actingUserPublicId: string | undefined;
    visibility: BaseRecordVisibility | undefined;
    requested: readonly string[] | undefined;
  }): Promise<{ column: string; ids: readonly number[] } | undefined> {
    const column = this.descriptor.branchColumn;
    if (!column) return undefined;
    const visible = await this.visibleBranchIds({
      organizationId: options.organizationId,
      userId: await this.userId(options.actingUserPublicId),
      visibility: options.visibility,
    });
    let ids: readonly number[] | null = visible;
    if (options.requested && options.requested.length > 0) {
      const picked = await resolveRecordIds({
        table: branches,
        organizationId: options.organizationId,
        publicIds: [...options.requested],
      });
      const pickedIds = [...picked.values()];
      ids = visible === null ? pickedIds : pickedIds.filter((id) => visible.includes(id));
    }
    return ids === null ? undefined : { column, ids };
  }

  /** A write may name only one of the caller's branches (or none) on a branch-scoped table. */
  private async assertBranchWritable(options: {
    organizationId: number;
    userId: number | null;
    visibility: BaseRecordVisibility | undefined;
    values: Record<string, unknown>;
  }): Promise<void> {
    const column = this.descriptor.branchColumn;
    if (!(column && column in options.values)) return;
    const visible = await this.visibleBranchIds(options);
    if (!branchAllowed({ branchId: options.values[column], visible })) {
      throw new ValidationError('errors:validation.branchNotYours', { field: column }, undefined, [
        { field: column, messageKey: 'errors:validation.branchNotYours' },
      ]);
    }
  }

  /**
   * The parent record's id for a route nested under it — 404 (the parent's name) when it is not
   * here or, on a branch-scoped table nested under its branch, not one of the caller's branches.
   */
  private async requireVisibleParentId(options: {
    organizationId: number;
    parentPublicId: string;
    userId: number | null;
    visibility: BaseRecordVisibility | undefined;
  }): Promise<number> {
    const parent = this.descriptor.parent!;
    const parentId = await this.requireParentId({
      organizationId: options.organizationId,
      parentPublicId: options.parentPublicId,
    });
    if (parent.field === this.descriptor.branchColumn) {
      const visible = await this.visibleBranchIds(options);
      if (!branchAllowed({ branchId: parentId, visible })) throw new NotFoundError(parent.label);
    }
    return parentId;
  }

  /**
   * A by-id route nested under the parent (`/branches/{branch_id}/rooms/{branch_room_id}`) names
   * the record's parent too: a record under another parent is a 404, like one not here.
   */
  private async assertUnderParent(options: {
    organizationId: number;
    row: BaseRecordRow;
    parentPublicId: string | undefined;
    userId: number | null;
    visibility: BaseRecordVisibility | undefined;
  }): Promise<void> {
    const { parent } = this.descriptor;
    if (!(parent && options.parentPublicId !== undefined)) return;
    const parentId = await this.requireVisibleParentId({
      organizationId: options.organizationId,
      parentPublicId: options.parentPublicId,
      userId: options.userId,
      visibility: options.visibility,
    });
    if (options.row[parent.field] !== parentId) throw new NotFoundError(this.descriptor.label);
  }

  /** The parent record's id; 404 (the parent's name) when it is not here. */
  private async requireParentId({
    organizationId,
    parentPublicId,
  }: {
    organizationId: number;
    parentPublicId: string;
  }): Promise<number> {
    const parent = this.descriptor.parent!;
    const ids = await resolveRecordIds({
      table: parent.table,
      organizationId,
      publicIds: [parentPublicId],
    });
    const id = ids.get(parentPublicId);
    if (id === undefined) throw new NotFoundError(parent.label);
    return id;
  }

  /** The table a reference field points at. */
  private referenceTable(field: string): PgTable {
    const reference = (this.descriptor.references ?? []).find((entry) => entry.field === field);
    if (!reference) throw new Error(`No reference named ${field}`);
    return reference.table;
  }

  /** The reference list a list field names. */
  private referenceList(field: string): BaseRecordReferenceList {
    const list = (this.descriptor.referenceLists ?? []).find((entry) => entry.field === field);
    if (!list) throw new Error(`No reference list named ${field}`);
    return list;
  }

  /** Turns referenced public ids in `values` into ids, in place; 400 on an unknown one. */
  private async resolveReferences({
    organizationId,
    values,
  }: {
    organizationId: number;
    values: Record<string, unknown>;
  }): Promise<void> {
    for (const reference of this.descriptor.references ?? []) {
      const value = values[reference.field];
      if (typeof value !== 'string') continue;
      const ids = await resolveRecordIds({
        table: reference.table,
        organizationId,
        publicIds: [value],
      });
      const id = ids.get(value);
      if (id === undefined) throw referenceNotFound({ reference, publicIds: [value] });
      values[reference.field] = id;
    }
  }

  /** Removes the list fields from `values` and resolves them to ids; 400 on an unknown one. */
  private async takeReferenceLists({
    organizationId,
    values,
  }: {
    organizationId: number;
    values: Record<string, unknown>;
  }): Promise<Map<BaseRecordReferenceList, number[]>> {
    const lists = new Map<BaseRecordReferenceList, number[]>();
    for (const list of this.descriptor.referenceLists ?? []) {
      const value = values[list.field];
      delete values[list.field];
      if (!Array.isArray(value)) continue;
      const publicIds = value as string[];
      const ids = await resolveRecordIds({
        table: list.link.targetTable,
        organizationId,
        publicIds,
        equals: list.require,
      });
      const unknown = publicIds.filter((publicId) => !ids.has(publicId));
      if (unknown.length > 0) throw referenceNotFound({ reference: list, publicIds: unknown });
      lists.set(
        list,
        publicIds.map((publicId) => ids.get(publicId)!),
      );
    }
    return lists;
  }

  /** Removes the child-list fields from `values`; the sent ones, to write after the record. */
  private takeChildLists(
    values: Record<string, unknown>,
  ): Map<BaseRecordChildList, Record<string, unknown>[]> {
    const children = new Map<BaseRecordChildList, Record<string, unknown>[]>();
    for (const child of this.descriptor.childLists ?? []) {
      const value = values[child.field];
      delete values[child.field];
      if (Array.isArray(value)) children.set(child, value as Record<string, unknown>[]);
    }
    return children;
  }

  /** Replaces each sent child list's rows; a constraint the table names becomes a 409. */
  private async writeChildLists({
    owner,
    children,
  }: {
    owner: BaseRecordRow;
    children: Map<BaseRecordChildList, Record<string, unknown>[]>;
  }): Promise<void> {
    for (const [child, rows] of children) {
      await this.mapConflicts(() => replaceChildRows({ child, owner, rows }));
    }
  }

  /** Writes each sent reference list to its link table. */
  private async writeReferenceLists(options: {
    organizationId: number;
    ownerId: number;
    lists: Map<BaseRecordReferenceList, number[]>;
    userId: number | null;
  }): Promise<void> {
    for (const [list, targetIds] of options.lists) {
      await replaceLinkedIds({
        link: list.link,
        ownerId: options.ownerId,
        organizationId: options.organizationId,
        targetIds,
        createdByUserId: options.userId,
      });
    }
  }

  /** D43: a save based on an older version than the stored one is refused with who and when. */
  private async assertNotChangedSince({
    row,
    expected,
  }: {
    row: BaseRecordRow;
    expected: unknown;
  }): Promise<void> {
    await assertRecordNotChangedSince({
      row,
      expected,
      resolveUserPublicId: (userInternalId) =>
        this.organizationService.resolveUserPublicIdByInternalId(userInternalId),
    });
  }

  /** Runs a write; a unique or exclusion clash the table names becomes a 409. */
  private async mapConflicts<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isPostgresUniqueViolation(error) || isPostgresExclusionViolation(error)) {
        const conflict = this.descriptor.conflicts?.[getPostgresConstraintName(error) ?? ''];
        if (typeof conflict === 'string') throw new ConflictError(conflict);
        if (conflict) throw new ConflictError(conflict.key).withReason(conflict.reason);
      }
      throw error;
    }
  }
}

/** The 400 for a referenced id that is no live record of the organization. */
function referenceNotFound({
  reference,
  publicIds,
}: {
  reference: { field: string; label: string; notFoundKey?: string };
  publicIds: readonly string[];
}): ValidationError {
  const { notFoundKey } = reference;
  if (notFoundKey) {
    return new ValidationError(
      notFoundKey,
      { id: publicIds.join(', ') },
      undefined,
      publicIds.map((id) => ({
        field: reference.field,
        messageKey: notFoundKey,
        messageParams: { id },
      })),
    );
  }
  return new ValidationError(
    'errors:validation.recordReferenceNotFound',
    { id: publicIds.join(', '), label: reference.label },
    undefined,
    [{ field: reference.field, messageKey: 'errors:validation.recordReferenceNotFound' }],
  );
}

/** Ports before the app container wires them — a rule that calls one fails loudly. */
const UNWIRED_PORTS: BaseRecordPorts = {
  organizationSettings: () => {
    throw new Error('BaseRecordService ports are not wired (app.container.ts → usePorts)');
  },
  findConfirmedUpload: () => {
    throw new Error('BaseRecordService ports are not wired (app.container.ts → usePorts)');
  },
  removeImageLocation: () => {
    throw new Error('BaseRecordService ports are not wired (app.container.ts → usePorts)');
  },
  fileReadUrls: () => {
    throw new Error('BaseRecordService ports are not wired (app.container.ts → usePorts)');
  },
};

/**
 * Each key's confirmed upload of the organization, in order (an entry's attachments M6, a photo
 * P25, a report's files P29) — a key that is none is a 400 on `field` naming it.
 *
 * @remarks
 * - **Algorithm:** one upload-port read per key, in the rule's organization context.
 * - **Failure modes:** `ValidationError` on `field` (`errors:validation.uploadKeyNotConfirmed`)
 *   for a key that is missing, pending or another organization's.
 */
export async function requireConfirmedUploads(options: {
  fileKeys: readonly string[] | undefined;
  field: string;
  context: BaseRecordWriteContext;
}): Promise<BaseRecordConfirmedUpload[]> {
  const uploads: BaseRecordConfirmedUpload[] = [];
  for (const fileKey of options.fileKeys ?? []) {
    const upload = await options.context.ports.findConfirmedUpload({
      organizationId: options.context.organizationId,
      fileKey,
    });
    if (!upload) {
      throw fieldValidationError({
        field: options.field,
        messageKey: 'errors:validation.uploadKeyNotConfirmed',
        messageParams: { key: fileKey },
      });
    }
    uploads.push(upload);
  }
  return uploads;
}

/** Rows per page an export reads (the list maximum). */
const EXPORT_PAGE_SIZE = 100;

/** Whether a row's branch (a number, or null for every branch) is among the visible ones. */
function branchAllowed({
  branchId,
  visible,
}: {
  branchId: unknown;
  visible: readonly number[] | null;
}): boolean {
  if (visible === null || branchId === null || branchId === undefined) return true;
  return typeof branchId === 'number' && visible.includes(branchId);
}

/** Whether a row's values fall inside a read scope (none = every row). */
function readScopeAllows({
  row,
  scope,
}: {
  row: BaseRecordRow;
  scope: Readonly<Record<string, readonly unknown[]>> | undefined;
}): boolean {
  return Object.entries(scope ?? {}).every(([field, allowed]) => allowed.includes(row[field]));
}

/** An empty page (a filter named a record that is not here). */
function emptyPage<Output>(limit: number): BaseRecordListResult<Output> {
  return { items: [], total: 0, limit, has_more: false, next_cursor: null };
}
