import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, MISSING_PERMISSION_REASON } from '@/shared/errors/index.js';
import { paginatedResponse, successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { hasOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import {
  buildAuditActorFields,
  listBodyFieldNames,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import { requireStrongRecentStepUpPreHandler } from '@/shared/middlewares/core/recent-step-up.middleware.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { withOrganizationExportSlot } from '@/domains/app/app-export-gate.js';
import type { BaseRecordService } from './base-record.service.js';
import type { BaseRecordExportOutput, BaseRecordVisibility } from './base-record.types.js';
import { toCsv } from '@/shared/utils/text/csv.util.js';

/** The request's path params (every route of a table declares its own param schema). */
function pathParams(request: FastifyRequest): Record<string, string | undefined> {
  return request.params as Record<string, string | undefined>;
}

/** Whether the caller holds at least one of `codes` (each read from the request's memoized set). */
async function holdsAnyPermission({
  request,
  codes,
}: {
  request: FastifyRequest;
  codes: readonly string[];
}): Promise<boolean> {
  for (const code of codes) {
    if (await hasOrganizationPermission({ request, permissionCode: code })) return true;
  }
  return false;
}

/** The longest filter value an audit row keeps (a list's or an export's query, B1-3). */
const AUDIT_FILTER_VALUE_MAX = 200;

/**
 * A list query as an audit row records it (B1-3, G2-3): the filters, never the paging, and the
 * free-text search only as `has_search` — a name typed into `q` is patient data.
 */
function auditFilters(query: unknown): Record<string, string | boolean> {
  const { after: _after, limit: _limit, q, ...filters } = (query ?? {}) as Record<string, unknown>;
  const recorded: Record<string, string | boolean> = {};
  for (const [name, value] of Object.entries(filters)) {
    const text = auditFilterText(value);
    if (text !== undefined) recorded[name] = text;
  }
  if (q !== undefined && q !== '') recorded.has_search = true;
  return recorded;
}

/**
 * A filter value as the audit row keeps it (cut to {@link AUDIT_FILTER_VALUE_MAX}): text as is,
 * numbers and flags as their text, a list as its scalars joined with commas; anything else is dropped.
 */
function auditFilterText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.slice(0, AUDIT_FILTER_VALUE_MAX);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString().slice(0, AUDIT_FILTER_VALUE_MAX);
  }
  if (Array.isArray(value)) {
    const scalars = value.filter(
      (entry): entry is string | number | boolean =>
        typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean',
    );
    return scalars
      .map((entry) => entry.toString())
      .join(',')
      .slice(0, AUDIT_FILTER_VALUE_MAX);
  }
  return undefined;
}

/** How many signed file links a read handed out (`file_url`, and each of `files[].file_url`). */
function countFileLinks(items: readonly unknown[]): number {
  let count = 0;
  for (const item of items) {
    const record = item as Record<string, unknown>;
    if (typeof record.file_url === 'string') count += 1;
    if (!Array.isArray(record.files)) continue;
    for (const file of record.files as Record<string, unknown>[]) {
      if (typeof file.file_url === 'string') count += 1;
    }
  }
  return count;
}

/** Where a table's routes take their ids from, and how its audit rows are named. */
export interface BaseRecordControllerOptions {
  /** Singular resource name for audit actions and types (`offering`). */
  resource: string;
  /** The by-id path param (`offering_id`). */
  idParam: string;
  /** The parent path param of nested list and create routes (`patient_id`). */
  parentParam?: string;
  /**
   * Output fields only holders of a permission see — everyone else gets `null` (the export's cell
   * blank): one code (`{ min_price: 'offering:lower_price:read' }`, launch O15 "Lowest price") or a
   * list, any of which shows it (a patient's medical details, launch D83 (3)).
   */
  hiddenFields?: Readonly<Record<string, string | readonly string[]>>;
  /** Body fields only holders of a permission may send — 403 otherwise (`{ field: 'resource:code' }`). */
  guardedFields?: Readonly<Record<string, string>>;
  /** The table's read permission — an export (gated by its resource's export code) needs it too. */
  readPermission?: string;
  /** The download's file name stem (`leads` → `leads-2026-10-07.csv`). */
  exportName?: string;
  /**
   * Derived filters every list and export call adds beside the query's — the same table read for
   * another screen (the medical store's payments, MD22, and their CSV, MD31).
   */
  listDerived?: Readonly<Record<string, unknown>>;
  /**
   * Reads are audited too (G2-3) — a clinical record's: each list page an `app.<resource>.list` row
   * (its count, filters and the signed file links it handed out), each record an
   * `app.<resource>.read` row. Never the rows themselves.
   */
  auditReads?: boolean;
  /**
   * {@link hiddenFields} whose cells, when the caller may see them, make an export need a strong
   * step-up on the session (B1-3 — a patient list with its medical details).
   */
  exportStepUpFields?: readonly string[];
}

/**
 * The base of every app record controller — the HTTP handlers a table shares. They coordinate
 * (scope, ids, branch visibility, audit) and leave every rule to the table's
 * {@link BaseRecordService}; a table's controller extends it and adds its own handlers.
 *
 * @remarks
 * - **Algorithm:** each handler reads the organization scope and the acting principal, validates
 *   the path ids, calls the service, records an `app.<resource>.<verb>` audit row for writes and
 *   answers with `successResponse` (a list with `paginatedResponse`, a delete with 204).
 * - **Failure modes:** the service's errors pass through to the error handler.
 * - **Notes:** handlers are arrow-function properties, so a route can take `controller.list`
 *   unbound.
 */
export class BaseRecordController<Output extends { id: string }> {
  constructor(
    protected readonly service: BaseRecordService<Output>,
    protected readonly options: BaseRecordControllerOptions,
  ) {}

  /** The by-id path param of the request. */
  protected readId(request: FastifyRequest): string {
    return validatePublicIdParam({
      value: pathParams(request)[this.options.idParam] ?? '',
      fieldName: this.options.idParam,
    });
  }

  /** The parent path param — only when the path has it (a table listed on its own and nested). */
  protected readParentId(request: FastifyRequest): string | undefined {
    const { parentParam } = this.options;
    const value = parentParam === undefined ? undefined : pathParams(request)[parentParam];
    return value === undefined || parentParam === undefined
      ? undefined
      : validatePublicIdParam({ value, fieldName: parentParam });
  }

  /**
   * What the caller may see — branch-scoped tables answer with the caller's branches only,
   * unless they hold `branch:read` ("See every branch", D9).
   */
  protected async visibility(request: FastifyRequest): Promise<BaseRecordVisibility> {
    return {
      allBranches: this.service.branchScoped
        ? await hasOrganizationPermission({ request, permissionCode: APP_PERMISSIONS.BRANCH_READ })
        : true,
      can: (code) => hasOrganizationPermission({ request, permissionCode: code }),
    };
  }

  /** Records the `app.<resource>.<verb>` audit row of a write. */
  protected async audit({
    request,
    verb,
    publicId,
    metadata = {},
  }: {
    request: FastifyRequest;
    verb: string;
    publicId: string;
    metadata?: Record<string, unknown> | undefined;
  }): Promise<void> {
    const auth = requirePrincipal(request);
    await recordScopedAuditEvent({
      request,
      input: {
        ...buildAuditActorFields(auth),
        action: `app.${this.options.resource}.${verb}`,
        resource_type: this.options.resource,
        organizationPublicId: requireOrganizationScope(request).organizationPublicId,
        metadata: { [`${this.options.resource}_public_id`]: publicId, ...metadata },
      },
    });
  }

  /**
   * Hides the output fields the caller may not see (null), per
   * {@link BaseRecordControllerOptions.hiddenFields} — a field with a code list shows when the caller
   * holds any of them.
   */
  protected async present<Item extends Output | Output[]>({
    request,
    output,
  }: {
    request: FastifyRequest;
    output: Item;
  }): Promise<Item> {
    const hidden = await this.hiddenFieldsOf(request);
    if (hidden.length === 0) return output;
    const blank = (item: Output) =>
      ({ ...item, ...Object.fromEntries(hidden.map((field) => [field, null])) }) as Output;
    return (Array.isArray(output) ? output.map(blank) : blank(output as Output)) as Item;
  }

  /** The output fields the caller may not see, per {@link BaseRecordControllerOptions.hiddenFields}. */
  private async hiddenFieldsOf(request: FastifyRequest): Promise<string[]> {
    const hidden: string[] = [];
    for (const [field, codes] of Object.entries(this.options.hiddenFields ?? {})) {
      if (
        !(await holdsAnyPermission({ request, codes: typeof codes === 'string' ? [codes] : codes }))
      ) {
        hidden.push(field);
      }
    }
    return hidden;
  }

  /** Records a read of a clinical table (G2-3) — best effort, like every read's audit. */
  private async auditRead({
    request,
    verb,
    metadata,
  }: {
    request: FastifyRequest;
    verb: 'list' | 'read';
    metadata: Record<string, unknown>;
  }): Promise<void> {
    if (!this.options.auditReads) return;
    await recordScopedAuditEvent({
      request,
      input: {
        ...buildAuditActorFields(requirePrincipal(request)),
        action: `app.${this.options.resource}.${verb}`,
        resource_type: this.options.resource,
        organizationPublicId: requireOrganizationScope(request).organizationPublicId,
        metadata,
      },
    });
  }

  /**
   * Records an export (B1-3): who, the filters, how many rows and whether the medical cells were in
   * it — never the rows. Fail-closed: no audit row, no file.
   */
  private async auditExport({
    request,
    rowCount,
    isTruncated,
    extra = {},
  }: {
    request: FastifyRequest;
    rowCount: number;
    isTruncated: boolean;
    extra?: Record<string, unknown>;
  }): Promise<void> {
    await recordScopedAuditEvent({
      request,
      failClosed: true,
      input: {
        ...buildAuditActorFields(requirePrincipal(request)),
        action: `app.${this.options.resource}.export`,
        resource_type: this.options.resource,
        organizationPublicId: requireOrganizationScope(request).organizationPublicId,
        metadata: {
          row_count: rowCount,
          is_truncated: isTruncated,
          filters: auditFilters(request.query),
          ...extra,
        },
      },
    });
  }

  /**
   * B1-3: an export that carries cells of {@link BaseRecordControllerOptions.exportStepUpFields}
   * needs a strong step-up (password or MFA) on this session — an API key never has one.
   */
  private async assertExportStepUp({
    request,
    reply,
    hidden,
  }: {
    request: FastifyRequest;
    reply: FastifyReply;
    hidden: readonly string[];
  }): Promise<boolean> {
    const fields = this.options.exportStepUpFields ?? [];
    if (!fields.some((field) => !hidden.includes(field))) return false;
    if (request.auth?.kind !== 'user') {
      throw new ForbiddenError('errors:strongStepUpRequired');
    }
    await requireStrongRecentStepUpPreHandler(request, reply);
    return true;
  }

  /** Refuses a body naming a field the caller may not set (403), per `guardedFields`. */
  protected async assertFieldsAllowed(request: FastifyRequest): Promise<void> {
    const body = (request.body ?? {}) as Record<string, unknown>;
    for (const [field, code] of Object.entries(this.options.guardedFields ?? {})) {
      if (field in body && !(await hasOrganizationPermission({ request, permissionCode: code }))) {
        throw new ForbiddenError('errors:fieldNeedsPermission', {
          field,
          permission: code,
        }).withReason('field_permission_required');
      }
    }
  }

  /** The acting user's public id (undefined for an API key). */
  protected actor(request: FastifyRequest): string | undefined {
    return getActingUserPublicId(requirePrincipal(request));
  }

  /** `GET` — one page of the table (under the parent when nested). */
  readonly list = async (request: FastifyRequest, _reply: FastifyReply) => {
    const page = await this.service.list({
      scope: requireOrganizationScope(request),
      query: request.query,
      options: {
        parentPublicId: this.readParentId(request),
        actingUserPublicId: this.actor(request),
        visibility: await this.visibility(request),
        ...(this.options.listDerived ? { derived: this.options.listDerived } : {}),
      },
    });
    const items = await this.present({ request, output: page.items });
    await this.auditRead({
      request,
      verb: 'list',
      metadata: {
        row_count: items.length,
        filters: auditFilters(request.query),
        parent_public_id: this.readParentId(request) ?? null,
        file_links_issued: countFileLinks(items),
      },
    });
    return paginatedResponse({
      data: items,
      request_id: getRequestIdentifier(request),
      pagination: {
        per_page: page.limit,
        next: page.next_cursor,
        has_more: page.has_more,
        ...(page.total === null ? {} : { estimated_total: page.total }),
      },
      extraMeta: page.meta,
    });
  };

  /** `GET …/{id}` — one live record. */
  readonly get = async (request: FastifyRequest, _reply: FastifyReply) => {
    const publicId = this.readId(request);
    const data = await this.service.get({
      scope: requireOrganizationScope(request),
      publicId,
      actingUserPublicId: this.actor(request),
      visibility: await this.visibility(request),
      parentPublicId: this.readParentId(request),
    });
    const presented = await this.present({ request, output: data });
    await this.auditRead({
      request,
      verb: 'read',
      metadata: {
        [`${this.options.resource}_public_id`]: publicId,
        file_links_issued: countFileLinks([presented]),
      },
    });
    return successResponse({ data: presented, request_id: getRequestIdentifier(request) });
  };

  /** `POST` — creates a record (under the parent when nested). */
  readonly create = async (request: FastifyRequest, _reply: FastifyReply) =>
    this.createRecord({ request, createName: undefined });

  /** `POST …/<name>` — a named create with its own body (`send-message`, `add-note`). */
  readonly createNamed = (name: string) => async (request: FastifyRequest, _reply: FastifyReply) =>
    this.createRecord({ request, createName: name });

  /** Creates a record with the table's create body or a named one; audited as a create. */
  private async createRecord({
    request,
    createName,
  }: {
    request: FastifyRequest;
    createName: string | undefined;
  }) {
    await this.assertFieldsAllowed(request);
    const data = await this.service.create({
      scope: requireOrganizationScope(request),
      body: request.body,
      actingUserPublicId: this.actor(request),
      parentPublicId: this.readParentId(request),
      visibility: await this.visibility(request),
      createName,
    });
    await this.audit({ request, verb: createName ?? 'create', publicId: data.id });
    return successResponse({
      data: await this.present({ request, output: data }),
      request_id: getRequestIdentifier(request),
    });
  }

  /** `PATCH …/{id}` — changes a live record. */
  readonly update = async (request: FastifyRequest, _reply: FastifyReply) => {
    await this.assertFieldsAllowed(request);
    const publicId = this.readId(request);
    const data = await this.service.update({
      scope: requireOrganizationScope(request),
      publicId,
      body: request.body,
      actingUserPublicId: this.actor(request),
      visibility: await this.visibility(request),
      parentPublicId: this.readParentId(request),
    });
    await this.audit({
      request,
      verb: 'update',
      publicId,
      metadata: {
        changed_fields: listBodyFieldNames(request.body),
      },
    });
    return successResponse({
      data: await this.present({ request, output: data }),
      request_id: getRequestIdentifier(request),
    });
  };

  /** `DELETE …/{id}?reason=&note=` — soft-deletes with why; 204. */
  readonly remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const publicId = this.readId(request);
    await this.service.remove({
      scope: requireOrganizationScope(request),
      publicId,
      query: request.query,
      actingUserPublicId: this.actor(request),
      visibility: await this.visibility(request),
      parentPublicId: this.readParentId(request),
    });
    await this.audit({
      request,
      verb: 'delete',
      publicId,
      metadata: {
        delete_reason: (request.query as { reason?: string }).reason,
      },
    });
    return reply.code(204).send();
  };

  /** `POST …/{id}/restore` — undoes a soft delete. */
  readonly restore = async (request: FastifyRequest, _reply: FastifyReply) => {
    const publicId = this.readId(request);
    const data = await this.service.restore({
      scope: requireOrganizationScope(request),
      publicId,
      actingUserPublicId: this.actor(request),
      visibility: await this.visibility(request),
      parentPublicId: this.readParentId(request),
    });
    await this.audit({ request, verb: 'restore', publicId });
    return successResponse({
      data: await this.present({ request, output: data }),
      request_id: getRequestIdentifier(request),
    });
  };

  /** `GET …/{id}/<view>` — a read view of one record (a table rule). */
  readonly view = (name: string) => async (request: FastifyRequest, _reply: FastifyReply) => {
    const data = await this.service.view({
      scope: requireOrganizationScope(request),
      publicId: this.readId(request),
      name,
      query: request.query,
      options: {
        actingUserPublicId: this.actor(request),
        visibility: await this.visibility(request),
      },
    });
    return successResponse({ data, request_id: getRequestIdentifier(request) });
  };

  /** `GET /<module>/<name>` — a read of the collection (a table rule). */
  readonly collectionView =
    (name: string) => async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await this.service.collection({
        scope: requireOrganizationScope(request),
        kind: 'view',
        name,
        input: request.query,
        options: {
          actingUserPublicId: this.actor(request),
          visibility: await this.visibility(request),
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    };

  /** `POST /<module>/<name>` — a write on the collection (a table rule), audited. */
  readonly collectionAction =
    (name: string) => async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await this.service.collection({
        scope: requireOrganizationScope(request),
        kind: 'action',
        name,
        input: request.body,
        options: {
          actingUserPublicId: this.actor(request),
          visibility: await this.visibility(request),
        },
      });
      await this.audit({
        request,
        verb: name,
        publicId: 'collection',
        metadata: {
          changed_fields: listBodyFieldNames(request.body),
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    };

  /**
   * `GET …/exports` — the list as a CSV download (D18 "Export lists"), same filters as the list:
   * a strong step-up when it carries the medical cells, one of the organization's export slots
   * (D-4) and an `app.<resource>.export` audit row before the file goes out (B1-3).
   */
  readonly export = async (request: FastifyRequest, reply: FastifyReply) => {
    const { readPermission } = this.options;
    if (
      readPermission &&
      !(await hasOrganizationPermission({ request, permissionCode: readPermission }))
    ) {
      throw new ForbiddenError('errors:forbidden').withReason(MISSING_PERMISSION_REASON);
    }
    const hidden = await this.hiddenFieldsOf(request);
    const medicalColumns = await this.assertExportStepUp({ request, reply, hidden });
    const scope = requireOrganizationScope(request);
    const visibility = await this.visibility(request);
    const { rows, is_truncated } = await withOrganizationExportSlot({
      organizationPublicId: scope.organizationPublicId,
      build: () =>
        this.service.exportRows({
          scope,
          query: request.query,
          options: {
            actingUserPublicId: this.actor(request),
            visibility,
            ...(this.options.listDerived ? { derived: this.options.listDerived } : {}),
          },
        }),
    });
    const presented = await this.present({ request, output: rows });
    await this.auditExport({
      request,
      rowCount: presented.length,
      isTruncated: is_truncated,
      extra: { medical_columns: medicalColumns },
    });
    const data: BaseRecordExportOutput = {
      file_name: `${this.options.exportName ?? this.options.resource}-${new Date().toISOString().slice(0, 10)}.csv`,
      content_type: 'text/csv',
      row_count: presented.length,
      is_truncated,
      content: toCsv(presented as unknown as Record<string, unknown>[]),
    };
    return successResponse({ data, request_id: getRequestIdentifier(request) });
  };

  /**
   * `GET /<module>/<name>/exports` — a collection view that answers an export envelope (a month's
   * purchase GST summary): built in one of the organization's export slots (D-4) and audited as
   * an `app.<resource>.export` naming the view (B1-3).
   */
  readonly collectionExport =
    (name: string) => async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const visibility = await this.visibility(request);
      const data = (await withOrganizationExportSlot({
        organizationPublicId: scope.organizationPublicId,
        build: () =>
          this.service.collection({
            scope,
            kind: 'view',
            name,
            input: request.query,
            options: { actingUserPublicId: this.actor(request), visibility },
          }),
      })) as BaseRecordExportOutput;
      await this.auditExport({
        request,
        rowCount: data.row_count,
        isTruncated: data.is_truncated,
        extra: { view: name },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    };

  /** The handler of one lifecycle action route (`POST …/{id}/<action>`). */
  readonly transition =
    (action: string) => async (request: FastifyRequest, _reply: FastifyReply) => {
      const publicId = this.readId(request);
      const data = await this.service.transition({
        scope: requireOrganizationScope(request),
        publicId,
        action,
        body: request.body,
        actingUserPublicId: this.actor(request),
        visibility: await this.visibility(request),
        parentPublicId: this.readParentId(request),
      });
      await this.audit({ request, verb: action, publicId });
      return successResponse({
        data: await this.present({ request, output: data }),
        request_id: getRequestIdentifier(request),
      });
    };
}
