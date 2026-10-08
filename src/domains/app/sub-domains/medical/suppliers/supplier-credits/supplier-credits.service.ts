import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import {
  medicine_batches,
  medicines,
} from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
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
 * Stock returned to a supplier and what they owe back (launch ROUTE #153, routes-final 11.C): the
 * credits list (a supplier's account), "Return expiring stock", one credit.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.supplier_credits` — the
 *   organization's, no branch (MD3); never changed or deleted (MD11 — no such routes). The rules
 *   take the stock out of the batch and apply the credit to the supplier's dues in the same
 *   transaction; a create answers with a fresh read (the credit as applied). Reading needs `medicine:read`, returning stock `medicine:update` (the routes'
 *   gates, MD2).
 * - **Failure modes:** `NotFoundError('Supplier credit')`; `ValidationError` for a bad body or
 *   query, or a batch or supplier that is no live record here; `ConflictError` per the rules.
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
        { field: 'created_by_membership_id', table: memberships, label: 'team member' },
      ],
      ...createSupplierCreditsRules(repository),
    });
  }

  /** Returns stock — and answers with the credit as applying it to the dues left it (MD11). */
  override async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
    parentPublicId?: string,
    visibility?: BaseRecordVisibility,
    createName?: string,
  ): Promise<SupplierCreditOutput> {
    const created = await super.create(
      scope,
      body,
      actingUserPublicId,
      parentPublicId,
      visibility,
      createName,
    );
    return this.get(scope, created.id, actingUserPublicId, visibility);
  }
}
