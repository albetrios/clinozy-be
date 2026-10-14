import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberReference } from '@/domains/app/app-member-reference.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import {
  medicine_batches,
  medicines,
} from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import { voidSupplierCreditQueryDto } from './supplier-credits.dto.js';
import type { SupplierCreditsRepository } from './supplier-credits.repository.js';
import { createSupplierCreditsRules } from './supplier-credits.rules.js';
import { serializeSupplierCredit } from './supplier-credits.serializer.js';
import type { SupplierCreditOutput } from './supplier-credits.types.js';
import {
  refuseSupplierCreditUpdate,
  validateCreateSupplierCredit,
  validateListSupplierCreditsQuery,
} from './supplier-credits.validator.js';

/**
 * Stock returned to a supplier and what they owe back (launch ROUTE #153, routes-final 11.C; rev 2
 * MD32, MD34): every credit (the Credits tab), a supplier's credits (its account), "Return expiring
 * stock", one credit, its void and the undo.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.supplier_credits`, nested under the
 *   supplier (`supplier_id` — a removed or unknown supplier is a 404, another supplier's credit a
 *   404; the nested list's path wins over `?supplier_id=`) and top-level for the Credits tab — the
 *   organization's, no branch (MD3); never changed (MD11), voided with why (`mistake`,
 *   `wrong_quantity`, `supplier_refused`, `other`) and undone (MD32). The rules move the stock and
 *   the supplier's dues in the same transaction; a create answers with a fresh read (the credit as
 *   applied). Reading needs `medicine:read`, returning stock `medicine:update`, a void and its undo
 *   `medicine:delete` (the routes' gates, MD2).
 * - **Failure modes:** `NotFoundError('Supplier credit')` / `('Supplier')`; `ValidationError` for a
 *   bad body or query, or a batch that is no live record here; `ConflictError` per the rules and a
 *   restore of a live credit (`record_not_deleted`).
 */
export class SupplierCreditsService extends BaseRecordService<SupplierCreditOutput> {
  constructor(organizationService: OrganizationService, repository: SupplierCreditsRepository) {
    super(organizationService, {
      label: 'Supplier credit',
      repository,
      parseCreate: validateCreateSupplierCredit,
      parseUpdate: refuseSupplierCreditUpdate,
      parseList: validateListSupplierCreditsQuery,
      serialize: serializeSupplierCredit,
      references: [
        { field: 'supplier_id', table: suppliers, label: 'supplier' },
        { field: 'medicine_id', table: medicines, label: 'medicine' },
        { field: 'medicine_batch_id', table: medicine_batches, label: 'medicine batch' },
        memberReference('created_by_membership_id'),
      ],
      parent: { field: 'supplier_id', table: suppliers, label: 'Supplier' },
      deleteQuery: voidSupplierCreditQueryDto,
      ...createSupplierCreditsRules(repository),
    });
  }

  /** Returns stock — and answers with the credit as applying it to the dues left it (MD11). */
  override async create({
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
  }): Promise<SupplierCreditOutput> {
    const created = await super.create({
      scope,
      body,
      actingUserPublicId,
      parentPublicId,
      visibility,
      createName,
    });
    return this.get({ scope, publicId: created.id, actingUserPublicId, visibility });
  }

  /** Undoes a void — and answers with the credit as applying the supplier's credits again left it (MD32). */
  override async restore({
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
  }): Promise<SupplierCreditOutput> {
    await super.restore({ scope, publicId, actingUserPublicId, visibility, parentPublicId });
    return this.get({ scope, publicId, actingUserPublicId, visibility });
  }
}
