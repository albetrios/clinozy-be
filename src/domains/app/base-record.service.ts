import type { PgTable } from 'drizzle-orm/pg-core';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/index.js';
import {
  getPostgresConstraintName,
  isPostgresUniqueViolation,
} from '@/shared/utils/infrastructure/postgres-error.util.js';
import {
  assertRecordNotChangedSince,
  recordDeleteQuerySchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  type BaseRecordPage,
  type BaseRecordRow,
  listLinkedPublicIds,
  listVisibleBranchIds,
  replaceLinkedIds,
  resolveRecordIds,
  resolveRecordPublicIds,
} from './base-record.repository.js';
import type {
  BaseRecordDescriptor,
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
  private ports: BaseRecordPorts = UNWIRED_PORTS;

  /** Wires the ports (once, from the app container). */
  usePorts(ports: BaseRecordPorts): void {
    this.ports = ports;
  }

  /** The context a write or a rule runs with. */
  protected writeContext(
    scope: OrganizationPrincipalDatabaseScope,
    organizationId: number,
    userId: number | null,
    visibility?: BaseRecordVisibility,
  ): BaseRecordWriteContext {
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
  async list(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
    options: {
      parentPublicId?: string | undefined;
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
      /** `false` skips the COUNT — for internal readers that never show a total. */
      withTotal?: boolean | undefined;
      /** Reference filters by many public ids (`{ patient_id: [pat_…] }`) — one `IN`, internal only. */
      referenceIn?: Readonly<Record<string, readonly string[]>> | undefined;
    } = {},
  ): Promise<BaseRecordListResult<Output>> {
    const input = this.descriptor.parseList(query);
    const parentPublicId = options.parentPublicId;
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const equals: Record<string, unknown> = { ...(input.equals ?? {}) };
      for (const [field, publicIds] of Object.entries(options.referenceIn ?? {})) {
        const ids = await resolveRecordIds({
          table: this.referenceTable(field),
          organizationId,
          publicIds: [...publicIds],
        });
        if (ids.size === 0) return emptyPage(input.limit);
        equals[field] = [...ids.values()];
      }
      if (this.descriptor.ownedByActor) {
        equals.created_by_user_id = await this.userId(options.actingUserPublicId);
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
      for (const [field, publicId] of Object.entries(input.referenceEquals ?? {})) {
        if (publicId === undefined) continue;
        const table = this.referenceTable(field);
        const ids = await resolveRecordIds({ table, organizationId, publicIds: [publicId] });
        const id = ids.get(publicId);
        if (id === undefined) return emptyPage(input.limit);
        equals[field] = id;
      }
      const readScope = await this.readScopeOf(options.visibility);
      for (const [field, allowed] of Object.entries(readScope ?? {})) {
        const requested = equals[field];
        const kept =
          requested === undefined
            ? [...allowed]
            : (Array.isArray(requested) ? requested : [requested]).filter((value) =>
                allowed.includes(value),
              );
        if (kept.length === 0) return emptyPage(input.limit);
        equals[field] = kept;
      }
      const branchScope = await this.branchScope({
        organizationId,
        actingUserPublicId: options.actingUserPublicId,
        visibility: options.visibility,
        requested: input.branchPublicIds,
      });
      const page: BaseRecordPage = await this.descriptor.repository.list(organizationId, {
        ...input,
        equals,
        branchScope,
        withTotal: options.withTotal,
      });
      const items = await this.serializeRows(page.items);
      await this.decorate(
        items,
        this.writeContext(
          scope,
          organizationId,
          await this.userId(options.actingUserPublicId),
          options.visibility,
        ),
      );
      return { ...page, items };
    });
  }

  /** One live record. */
  async get(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    actingUserPublicId?: string,
    visibility?: BaseRecordVisibility,
    parentPublicId?: string,
  ): Promise<Output> {
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const userId = await this.userId(actingUserPublicId);
      const row = await this.requireRow(organizationId, publicId, userId, visibility);
      await this.assertUnderParent({ organizationId, row, parentPublicId, userId, visibility });
      return this.serializeOne(row, this.writeContext(scope, organizationId, userId, visibility));
    });
  }

  /** Creates a record (under the parent when nested). */
  async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
    parentPublicId?: string,
    visibility?: BaseRecordVisibility,
  ): Promise<Output> {
    const parsed = this.descriptor.parseCreate(body);
    return withAppDatabaseContext(scope, async () => {
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
      await this.resolveReferences(organizationId, values);
      await this.assertBranchWritable({ organizationId, userId, visibility, values });
      const lists = await this.takeReferenceLists(organizationId, values);
      const context = this.writeContext(scope, organizationId, userId, visibility);
      await this.descriptor.prepareCreate?.(values, context);
      this.descriptor.checkValues?.(values);
      const row = await this.mapConflicts(() =>
        this.descriptor.repository.insert({
          ...values,
          organization_id: organizationId,
          created_by_user_id: userId,
          updated_by_user_id: userId,
        }),
      );
      await this.writeReferenceLists({ organizationId, ownerId: row.id, lists, userId });
      await this.descriptor.afterWrite?.(row, { kind: 'create' }, context);
      return this.serializeOne(row, context);
    });
  }

  /** Changes a live record; refuses a stale save (`expected_updated_at`, D43). */
  async update(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    body: unknown,
    actingUserPublicId: string | undefined,
    visibility?: BaseRecordVisibility,
    parentPublicId?: string,
  ): Promise<Output> {
    const { expected_updated_at: expectedUpdatedAt, ...parsed } = this.descriptor.parseUpdate(body);
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const userId = await this.userId(actingUserPublicId);
      const existing = await this.requireRow(organizationId, publicId, userId, visibility);
      await this.assertUnderParent({
        organizationId,
        row: existing,
        parentPublicId,
        userId,
        visibility,
      });
      await this.assertNotChangedSince(existing, expectedUpdatedAt);
      const values: Record<string, unknown> = { ...parsed };
      await this.resolveReferences(organizationId, values);
      await this.assertBranchWritable({ organizationId, userId, visibility, values });
      const lists = await this.takeReferenceLists(organizationId, values);
      const context = this.writeContext(scope, organizationId, userId, visibility);
      await this.descriptor.prepareUpdate?.(values, existing, context);
      this.descriptor.checkValues?.({ ...existing, ...values });
      const updated = await this.mapConflicts(() =>
        this.descriptor.repository.update(existing.id, values, userId),
      );
      if (!updated) throw new NotFoundError(this.descriptor.label);
      await this.writeReferenceLists({ organizationId, ownerId: updated.id, lists, userId });
      await this.descriptor.afterWrite?.(updated, { kind: 'update', before: existing }, context);
      return this.serializeOne(updated, context);
    });
  }

  /** Runs a lifecycle action (`cancel`, `approve`, …) if the record's status allows it. */
  async transition(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    action: string,
    body: unknown,
    actingUserPublicId: string | undefined,
    visibility?: BaseRecordVisibility,
  ): Promise<Output> {
    const custom = this.descriptor.actions?.[action];
    if (custom) {
      return this.runAction({
        scope,
        publicId,
        action,
        body,
        actingUserPublicId,
        visibility,
        run: custom,
      });
    }
    const transition = this.descriptor.transitions?.[action];
    if (!transition) throw new NotFoundError(this.descriptor.label);
    const extra = transition.parse ? transition.parse(body) : {};
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const userId = await this.userId(actingUserPublicId);
      const existing = await this.requireRow(organizationId, publicId, userId, visibility);
      const statusColumn = transition.statusColumn ?? 'status';
      const status = String(existing[statusColumn] ?? '');
      if (transition.from && !transition.from.includes(status)) {
        throw new ConflictError('errors:recordTransitionNotAllowed', { action, status }).withReason(
          'transition_not_allowed',
        );
      }
      const values: Record<string, unknown> = { ...(transition.set ?? {}), ...extra };
      for (const column of transition.stamp ?? []) values[column] = new Date();
      await this.resolveReferences(organizationId, values);
      const context = this.writeContext(scope, organizationId, userId, visibility);
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
      return this.serializeOne(updated, context);
    });
  }

  /** Soft-deletes a record with why (`?reason=&note=`). */
  async remove(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    query: unknown,
    actingUserPublicId: string | undefined,
    visibility?: BaseRecordVisibility,
    parentPublicId?: string,
  ): Promise<void> {
    const removal = parseWithSchema(recordDeleteQuerySchema, query);
    await withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const userId = await this.userId(actingUserPublicId);
      const existing = await this.requireRow(organizationId, publicId, userId, visibility);
      await this.assertUnderParent({
        organizationId,
        row: existing,
        parentPublicId,
        userId,
        visibility,
      });
      const deleted = await this.descriptor.repository.softDelete(
        existing.id,
        { delete_reason: removal.reason, delete_note: removal.note ?? null },
        userId,
      );
      if (!deleted) throw new NotFoundError(this.descriptor.label);
      await this.descriptor.afterWrite?.(
        deleted,
        { kind: 'delete', before: existing },
        this.writeContext(scope, organizationId, userId, visibility),
      );
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
    run: (input: BaseRecordActionInput) => Promise<BaseRecordRow>;
  }): Promise<Output> {
    const { scope } = options;
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const userId = await this.userId(options.actingUserPublicId);
      const existing = await this.requireRow(
        organizationId,
        options.publicId,
        userId,
        options.visibility,
      );
      const context = this.writeContext(scope, organizationId, userId, options.visibility);
      const row = await options.run({
        existing,
        input: (options.body ?? {}) as Record<string, unknown>,
        context,
        visibility: options.visibility,
        repository: this.descriptor.repository,
        present: (rows) =>
          this.present(rows, this.writeContext(scope, organizationId, userId, options.visibility)),
      });
      await this.descriptor.afterWrite?.(
        row,
        { kind: 'transition', action: options.action, before: existing },
        context,
      );
      return this.serializeOne(row, context);
    });
  }

  /** A read view of one record (`GET …/{id}/<view>`). */
  async view(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    name: string,
    query: unknown,
    options: {
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
    },
  ): Promise<unknown> {
    const run = this.descriptor.views?.[name];
    if (!run) throw new NotFoundError(this.descriptor.label);
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const userId = await this.userId(options.actingUserPublicId);
      const existing = await this.requireRow(organizationId, publicId, userId, options.visibility);
      return run({
        existing,
        input: (query ?? {}) as Record<string, unknown>,
        context: this.writeContext(scope, organizationId, userId, options.visibility),
        visibility: options.visibility,
        repository: this.descriptor.repository,
        present: (rows) =>
          this.present(rows, this.writeContext(scope, organizationId, userId, options.visibility)),
      });
    });
  }

  /** A collection action (`POST /<module>/<name>`) or view (`GET /<module>/<name>`). */
  async collection(
    scope: OrganizationPrincipalDatabaseScope,
    kind: 'action' | 'view',
    name: string,
    input: unknown,
    options: {
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
    },
  ): Promise<unknown> {
    const run = (
      kind === 'action' ? this.descriptor.collectionActions : this.descriptor.collectionViews
    )?.[name];
    if (!run) throw new NotFoundError(this.descriptor.label);
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const userId = await this.userId(options.actingUserPublicId);
      return run({
        input: (input ?? {}) as Record<string, unknown>,
        context: this.writeContext(scope, organizationId, userId, options.visibility),
        visibility: options.visibility,
        repository: this.descriptor.repository,
        present: (rows) =>
          this.present(rows, this.writeContext(scope, organizationId, userId, options.visibility)),
        branchScope: (requested) =>
          this.branchScope({
            organizationId,
            actingUserPublicId: options.actingUserPublicId,
            visibility: options.visibility,
            requested,
          }),
        resolveReferences: (values) => this.resolveReferences(organizationId, values),
      });
    });
  }

  /** Serializes rows for a rule's answer, with the per-viewer fields (for collection results). */
  async present(rows: BaseRecordRow[], context: BaseRecordWriteContext): Promise<Output[]> {
    const outputs = await this.serializeRows(rows);
    await this.decorate(outputs, context);
    return outputs;
  }

  /** Undoes a soft delete within the restore window. */
  async restore(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    actingUserPublicId: string | undefined,
    visibility?: BaseRecordVisibility,
    parentPublicId?: string,
  ): Promise<Output> {
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const { repository } = this.descriptor;
      const deleted = await repository.findByPublicId(publicId, organizationId, { deleted: true });
      if (
        deleted &&
        !(await this.isRowVisible({ organizationId, row: deleted, actingUserPublicId, visibility }))
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
      let restored: BaseRecordRow | null;
      try {
        restored = await repository.restore(deleted.id, userId);
      } catch (error) {
        if (isPostgresUniqueViolation(error)) {
          throw new ConflictError('errors:recordRestoreConflict').withReason(
            'record_restore_conflict',
          );
        }
        throw error;
      }
      if (!restored) throw new NotFoundError(this.descriptor.label);
      await this.descriptor.afterWrite?.(
        restored,
        { kind: 'restore' },
        this.writeContext(scope, organizationId, userId, visibility),
      );
      return this.serializeOne(
        restored,
        this.writeContext(scope, organizationId, userId, visibility),
      );
    });
  }

  /** Serializes rows with their references' public ids read in one batch per field. */
  protected async serializeRows(rows: BaseRecordRow[]): Promise<Output[]> {
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
    const lookup: BaseRecordReferenceLookup = {
      publicIdOf: (field, row) => {
        const value = row[field];
        return typeof value === 'number' ? (publicIds.get(field)?.get(value) ?? null) : null;
      },
      listOf: (field, row) => lists.get(field)?.get(row.id) ?? [],
    };
    return rows.map((row) => this.descriptor.serialize(row, lookup));
  }

  /** Serializes one row, with the per-viewer fields when the caller is known. */
  protected async serializeOne(
    row: BaseRecordRow,
    context?: BaseRecordWriteContext,
  ): Promise<Output> {
    const [output] = await this.serializeRows([row]);
    if (context) await this.decorate([output!], context);
    return output!;
  }

  /** Adds the table's per-viewer fields ({@link BaseRecordRules.decorate}). */
  private async decorate(outputs: Output[], context: BaseRecordWriteContext): Promise<void> {
    if (!this.descriptor.decorate || outputs.length === 0) return;
    await this.descriptor.decorate(outputs as unknown as Record<string, unknown>[], context);
  }

  /**
   * Every row a list query matches, for a download — up to {@link BASE_RECORD_EXPORT_ROW_LIMIT},
   * paging through the list (its filters, sort, visibility and rules).
   */
  async exportRows(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
    options: {
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
    },
  ): Promise<{ rows: Output[]; is_truncated: boolean }> {
    const { after: _after, limit: _limit, ...filters } = (query ?? {}) as Record<string, unknown>;
    const rows: Output[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await this.list(
        scope,
        { ...filters, limit: EXPORT_PAGE_SIZE, ...(after === undefined ? {} : { after }) },
        { ...options, withTotal: false },
      );
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
  protected async requireRow(
    organizationId: number,
    publicId: string,
    userId: number | null,
    visibility?: BaseRecordVisibility,
  ): Promise<BaseRecordRow> {
    const row = await this.descriptor.repository.findByPublicId(publicId, organizationId);
    if (!row) throw new NotFoundError(this.descriptor.label);
    if (this.descriptor.ownedByActor && row.created_by_user_id !== userId) {
      throw new NotFoundError(this.descriptor.label);
    }
    const visible = await this.visibleBranchIds({ organizationId, userId, visibility });
    if (!branchAllowed(row[this.descriptor.branchColumn ?? ''], visible)) {
      throw new NotFoundError(this.descriptor.label);
    }
    if (!readScopeAllows(row, await this.readScopeOf(visibility))) {
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

  /** Whether a (deleted) row is in the caller's branches — the restore check. */
  private async isRowVisible(options: {
    organizationId: number;
    row: BaseRecordRow;
    actingUserPublicId: string | undefined;
    visibility: BaseRecordVisibility | undefined;
  }): Promise<boolean> {
    const visible = await this.visibleBranchIds({
      organizationId: options.organizationId,
      userId: await this.userId(options.actingUserPublicId),
      visibility: options.visibility,
    });
    return (
      branchAllowed(options.row[this.descriptor.branchColumn ?? ''], visible) &&
      readScopeAllows(options.row, await this.readScopeOf(options.visibility))
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
    if (!branchAllowed(options.values[column], visible)) {
      throw new ValidationError(
        'errors:validation.branchNotYours',
        { field: column },
        { [column]: ['This is not one of your branches'] },
      );
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
    const parentId = await this.requireParentId(options.organizationId, options.parentPublicId);
    if (parent.field === this.descriptor.branchColumn) {
      const visible = await this.visibleBranchIds(options);
      if (!branchAllowed(parentId, visible)) throw new NotFoundError(parent.label);
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
  private async requireParentId(organizationId: number, parentPublicId: string): Promise<number> {
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

  /** Turns referenced public ids in `values` into ids, in place; 400 on an unknown one. */
  private async resolveReferences(
    organizationId: number,
    values: Record<string, unknown>,
  ): Promise<void> {
    for (const reference of this.descriptor.references ?? []) {
      const value = values[reference.field];
      if (typeof value !== 'string') continue;
      const ids = await resolveRecordIds({
        table: reference.table,
        organizationId,
        publicIds: [value],
      });
      const id = ids.get(value);
      if (id === undefined) throw referenceNotFound(reference, [value]);
      values[reference.field] = id;
    }
  }

  /** Removes the list fields from `values` and resolves them to ids; 400 on an unknown one. */
  private async takeReferenceLists(
    organizationId: number,
    values: Record<string, unknown>,
  ): Promise<Map<BaseRecordReferenceList, number[]>> {
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
      });
      const unknown = publicIds.filter((publicId) => !ids.has(publicId));
      if (unknown.length > 0) throw referenceNotFound(list, unknown);
      lists.set(
        list,
        publicIds.map((publicId) => ids.get(publicId)!),
      );
    }
    return lists;
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
  private async assertNotChangedSince(row: BaseRecordRow, expected: unknown): Promise<void> {
    await assertRecordNotChangedSince({
      row,
      expected,
      resolveUserPublicId: (userInternalId) =>
        this.organizationService.resolveUserPublicIdByInternalId(userInternalId),
    });
  }

  /** Runs a write; a unique clash the table names becomes a 409. */
  private async mapConflicts<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        const key = this.descriptor.conflicts?.[getPostgresConstraintName(error) ?? ''];
        if (key) throw new ConflictError(key);
      }
      throw error;
    }
  }
}

/** The 400 for a referenced id that is no live record of the organization. */
function referenceNotFound(
  reference: { field: string; label: string },
  publicIds: readonly string[],
): ValidationError {
  return new ValidationError(
    'errors:validation.recordReferenceNotFound',
    { id: publicIds.join(', '), label: reference.label },
    {
      [reference.field]: publicIds.map(
        (publicId) => `${publicId} is not a ${reference.label} of this organization`,
      ),
    },
  );
}

/** Ports before the app container wires them — a rule that calls one fails loudly. */
const UNWIRED_PORTS: BaseRecordPorts = {
  organizationSettings: () => {
    throw new Error('BaseRecordService ports are not wired (app.container.ts → usePorts)');
  },
};

/** Rows per page an export reads (the list maximum). */
const EXPORT_PAGE_SIZE = 100;

/** Whether a row's branch (a number, or null for every branch) is among the visible ones. */
function branchAllowed(branchId: unknown, visible: readonly number[] | null): boolean {
  if (visible === null || branchId === null || branchId === undefined) return true;
  return typeof branchId === 'number' && visible.includes(branchId);
}

/** Whether a row's values fall inside a read scope (none = every row). */
function readScopeAllows(
  row: BaseRecordRow,
  scope: Readonly<Record<string, readonly unknown[]>> | undefined,
): boolean {
  return Object.entries(scope ?? {}).every(([field, allowed]) => allowed.includes(row[field]));
}

/** An empty page (a filter named a record that is not here). */
function emptyPage<Output>(limit: number): BaseRecordListResult<Output> {
  return { items: [], total: 0, limit, has_more: false, next_cursor: null };
}
