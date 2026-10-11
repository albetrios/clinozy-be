import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { assertLineMedicinesLive } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.rules.js';
import { memberReference } from '@/domains/app/app-member-reference.js';
import type { PrescriptionKitsRepository } from './prescription-kits.repository.js';
import { serializePrescriptionKit } from './prescription-kits.serializer.js';
import type { PrescriptionKitOutput } from './prescription-kits.types.js';
import {
  validateCreatePrescriptionKit,
  validateListPrescriptionKitsQuery,
  validateUpdatePrescriptionKit,
} from './prescription-kits.validator.js';

/**
 * A doctor's own prescription kits (launch ROUTE #133, routes-final 7.D): list, read, save, change,
 * delete with a reason, restore — the screen copies a kit's lines into a draft (no server-side
 * apply, P17).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on its table with `owner_membership_id` as
 *   the owner column: a create belongs to the caller's membership, and every read and write sees
 *   only the caller's kits (another member's is a 404). Each line's medicine is checked (P15).
 * - **Failure modes:** `NotFoundError('Prescription kit')`; `ValidationError` for a bad body or a
 *   line's medicine that is none; `ConflictError` for a name the caller already uses (any case), a
 *   stale save, a restore of a live kit or of a name reused meanwhile; `ForbiddenError`
 *   `not_a_member` for a caller who is no member.
 */
export class PrescriptionKitsService extends BaseRecordService<PrescriptionKitOutput> {
  constructor(organizationService: OrganizationService, repository: PrescriptionKitsRepository) {
    super(organizationService, {
      label: 'Prescription kit',
      repository,
      parseCreate: validateCreatePrescriptionKit,
      parseUpdate: validateUpdatePrescriptionKit,
      parseList: validateListPrescriptionKitsQuery,
      serialize: serializePrescriptionKit,
      references: [memberReference('owner_membership_id')],
      ownerMembershipColumn: 'owner_membership_id',
      conflicts: {
        idx_prescription_kits_owner_name_unique: 'errors:recordAlreadyExists',
      },
      prepareCreate: (values, context) => assertLineMedicinesLive({ items: values.items, context }),
      prepareUpdate: (values, _existing, context) =>
        assertLineMedicinesLive({ items: values.items, context }),
    });
  }
}
