import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { patient_prescriptions } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.schema.js';
import { voidMedicalSaleQueryDto } from './medical-sales.dto.js';
import type { MedicalSalesRepository } from './medical-sales.repository.js';
import { createMedicalSalesRules } from './medical-sales.rules.js';
import { serializeMedicalSale } from './medical-sales.serializer.js';
import type { MedicalSaleOutput } from './medical-sales.types.js';
import {
  refuseMedicalSaleUpdate,
  validateCreateMedicalSale,
  validateListMedicalSalesQuery,
} from './medical-sales.validator.js';

/**
 * The medical store's sales (launch ROUTE #153, routes-final 11.H): the Sales tab and its CSV, a
 * new sale with its `medical` invoice, read, void and undo, and returns from the patient.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.medical_sales`, branch-scoped as
 *   invoices (MD3 — `branch:read` sees every branch); never edited (MD19); the void is the soft
 *   delete with its own reasons (MD20). The rules write the invoice through the invoice ledger and
 *   move the batches (MD4, MD7). A create answers with the sale as its invoice left it (a fresh
 *   read). Reading needs `medicine:read`, selling `medicine:create` (and `payment:create` for
 *   "Paid now"), voiding and its undo `medicine:delete`, a return `payment:delete` (MD23), the CSV
 *   `medicine:export` (the routes' gates, MD2).
 * - **Failure modes:** `NotFoundError('Medical sale')`; `ValidationError` for a bad body or query,
 *   or a branch, contact or prescription that is no live record here; `ConflictError` per the
 *   rules, a prescription filled by another live sale, or a restore of a live one.
 */
export class MedicalSalesService extends BaseRecordService<MedicalSaleOutput> {
  constructor(organizationService: OrganizationService, repository: MedicalSalesRepository) {
    super(organizationService, {
      label: 'Medical sale',
      repository,
      deleteQuery: voidMedicalSaleQueryDto,
      parseCreate: validateCreateMedicalSale,
      parseUpdate: refuseMedicalSaleUpdate,
      parseList: validateListMedicalSalesQuery,
      serialize: serializeMedicalSale,
      references: [
        { field: 'branch_id', table: branches, label: 'branch' },
        { field: 'contact_id', table: contacts, label: 'contact' },
        { field: 'invoice_id', table: invoices, label: 'invoice' },
        {
          field: 'patient_prescription_id',
          table: patient_prescriptions,
          label: 'prescription',
        },
      ],
      branchColumn: 'branch_id',
      conflicts: {
        idx_medical_sales_patient_prescription_unique: {
          key: 'errors:medicalSalePrescriptionFilled',
          reason: 'prescription_filled',
        },
      },
      ...createMedicalSalesRules(repository),
    });
  }

  /** Sells — and answers with the sale as its invoice and "Paid now" left it (MD19). */
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
  }): Promise<MedicalSaleOutput> {
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
}
