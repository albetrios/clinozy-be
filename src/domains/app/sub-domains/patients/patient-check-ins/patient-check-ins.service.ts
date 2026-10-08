import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { withAppDatabaseContext } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import type { PatientCheckInsRepository } from './patient-check-ins.repository.js';
import { createPatientCheckInsRules } from './patient-check-ins.rules.js';
import { serializePatientCheckIn } from './patient-check-ins.serializer.js';
import type { PatientCheckInOutput } from './patient-check-ins.types.js';
import {
  validateCreatePatientCheckIn,
  validateListPatientCheckInsQuery,
  validateUpdatePatientCheckIn,
} from './patient-check-ins.validator.js';

/** The message an offering that is not active here answers with (O13). */
const OFFERING_NOT_ACTIVE_KEY = 'errors:validation.offeringNotActive';

/**
 * A patient's check-ins (launch ROUTE #134, routes-final 7.I): how the patient is doing after a
 * visit or a session — list, read, log (with the next offerings planned), change, delete with a
 * reason, restore, and log what was done about one (7.K).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404); the visit and the session are references. A create with
 *   `next_offering_ids` resolves them as the organization's active offerings first, then plans
 *   them — one `planned` suggestion each, linked by `patient_check_in_id`, skipping what the plan
 *   already holds (TR10) — in the check-in's transaction. Reading needs `patient:read`, writing
 *   `patient:update` (the routes' gates).
 * - **Failure modes:** `NotFoundError('Patient check-in')` / `('Patient')`; `ValidationError` for
 *   a bad body or query, a reference that is no live record here, another patient's visit or
 *   session, a future `check_in_date` or an offering that is not active (`next_offering_ids`);
 *   `ConflictError` for a stale save or a restore of a live check-in.
 */
export class PatientCheckInsService extends BaseRecordService<PatientCheckInOutput> {
  constructor(
    organizationService: OrganizationService,
    private readonly checkInsRepository: PatientCheckInsRepository,
  ) {
    super(organizationService, {
      label: 'Patient check-in',
      repository: checkInsRepository,
      parseCreate: validateCreatePatientCheckIn,
      parseUpdate: validateUpdatePatientCheckIn,
      parseList: validateListPatientCheckInsQuery,
      serialize: serializePatientCheckIn,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'patient_treatment_id', table: patient_treatments, label: 'treatment' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      ...createPatientCheckInsRules(checkInsRepository),
    });
  }

  /** Logs a check-in; its `next_offering_ids` become the patient's planned offerings (TR10). */
  override async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
    parentPublicId?: string,
    visibility?: BaseRecordVisibility,
    createName?: string,
  ): Promise<PatientCheckInOutput> {
    const { next_offering_ids: nextOfferingIds } = validateCreatePatientCheckIn(body);
    const { next_offering_ids: _planned, ...checkIn } = body as Record<string, unknown>;
    if (nextOfferingIds === undefined || nextOfferingIds.length === 0) {
      return super.create(
        scope,
        checkIn,
        actingUserPublicId,
        parentPublicId,
        visibility,
        createName,
      );
    }
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const offeringIds = await resolveRecordIds({
        table: offerings,
        organizationId,
        publicIds: nextOfferingIds,
        equals: { is_active: true },
      });
      const inactive = nextOfferingIds.filter((publicId) => !offeringIds.has(publicId));
      if (inactive.length > 0) {
        throw new ValidationError(
          OFFERING_NOT_ACTIVE_KEY,
          { id: inactive.join(', ') },
          undefined,
          inactive.map((id) => ({
            field: 'next_offering_ids',
            messageKey: OFFERING_NOT_ACTIVE_KEY,
            messageParams: { id },
          })),
        );
      }
      const created = await super.create(
        scope,
        checkIn,
        actingUserPublicId,
        parentPublicId,
        visibility,
        createName,
      );
      const row = await this.checkInsRepository.findByPublicId(created.id, organizationId);
      if (!row) return created;
      await this.checkInsRepository.planNextOfferings({
        organizationId,
        patientId: row.patient_id as number,
        checkInId: row.id,
        appointmentId: (row.appointment_id as number | null) ?? null,
        offeringIds: nextOfferingIds.map((publicId) => offeringIds.get(publicId)!),
        userId: await this.userId(actingUserPublicId),
      });
      return this.get(scope, created.id, actingUserPublicId, visibility, parentPublicId);
    });
  }
}
