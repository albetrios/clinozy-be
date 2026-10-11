import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { withAppDatabaseContext } from '@/infrastructure/database/contexts/database-context.js';
import { env } from '@/shared/config/env.config.js';
import { ValidationError } from '@/shared/errors/index.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type {
  BaseRecordListResult,
  BaseRecordVisibility,
} from '@/domains/app/base-record.types.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { PATIENT_IMAGE_ALBUM } from './patient-images.constants.js';
import type { PatientImagesRepository } from './patient-images.repository.js';
import { createPatientImagesRules } from './patient-images.rules.js';
import { serializePatientImage } from './patient-images.serializer.js';
import type { PatientImageOutput } from './patient-images.types.js';
import {
  validateCreatePatientImage,
  validateListPatientImagesQuery,
  validateUpdatePatientImage,
} from './patient-images.validator.js';

/**
 * A patient's photos (launch ROUTE #133, routes-final 7.F): the album tabs with their counts, read,
 * add, change or move to another album, delete with a reason, restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404); the visit and the session are references. A new photo's
 *   stored file loses its location before it is filed (D79, WC-42). A list adds
 *   `meta.album_counts` — the live photos per album the caller can see (P26). Reading needs
 *   `patient:clinical_record:read`, writing `patient:update` with it (P14 — the routes' gates).
 * - **Failure modes:** `NotFoundError('Patient image')` / `('Patient')`; `ValidationError` for a bad
 *   body or query, a reference that is no live record here, an upload that is no confirmed photo,
 *   a future `taken_on` or another patient's link; `ConflictError` `image_exists` (P25), a stale save
 *   or a restore of a live photo; `ForbiddenError` `field_permission_required` (the private album).
 */
export class PatientImagesService extends BaseRecordService<PatientImageOutput> {
  constructor(
    organizationService: OrganizationService,
    private readonly imagesRepository: PatientImagesRepository,
  ) {
    super(organizationService, {
      label: 'Patient image',
      repository: imagesRepository,
      parseCreate: validateCreatePatientImage,
      parseUpdate: validateUpdatePatientImage,
      parseList: validateListPatientImagesQuery,
      serialize: serializePatientImage,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'patient_treatment_id', table: patient_treatments, label: 'treatment' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      conflicts: {
        idx_patient_images_organization_file_key: {
          key: 'errors:patientImageExists',
          reason: 'image_exists',
        },
      },
      ...createPatientImagesRules(imagesRepository),
    });
  }

  /**
   * Files a photo (route 34) — after its stored file has lost where it was taken (D79, WC-42): the
   * body is parsed, the upload domain rewrites the JPEG / PNG without its GPS block and XMP, then
   * the shared create path files it. A storage failure files nothing (the photo is never shown
   * with its location).
   */
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
  }): Promise<PatientImageOutput> {
    if (env.PATIENT_IMAGE_LOCATION_REMOVAL_ENABLED) {
      const { file_key: fileKey } = validateCreatePatientImage(body);
      const organizationId = await withAppDatabaseContext({
        scope,
        callback: () => this.organizationId(scope),
      });
      try {
        await this.ports.removeImageLocation({ scope, organizationId, fileKey });
      } catch (error) {
        // A key that is no confirmed upload here: the create's own check answers it (`file_key`)
        if (!(error instanceof ValidationError)) throw error;
      }
    }
    return super.create({
      scope,
      body,
      actingUserPublicId,
      parentPublicId,
      visibility,
      createName,
    });
  }

  /** One page of the patient's photos, with `meta.album_counts` for the tabs (P26). */
  override async list({
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
      withTotal?: boolean | undefined;
      referenceIn?: Readonly<Record<string, readonly string[]>> | undefined;
    };
  }): Promise<BaseRecordListResult<PatientImageOutput>> {
    const page = await super.list({ scope, query, options });
    if (options.parentPublicId === undefined) return page;
    const parentPublicId = options.parentPublicId;
    const albumCounts = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const patientId = (
          await resolveRecordIds({ table: patients, organizationId, publicIds: [parentPublicId] })
        ).get(parentPublicId);
        const counts =
          patientId === undefined
            ? new Map<string, number>()
            : await this.imagesRepository.countLiveByAlbum(patientId);
        const canSeePrivate =
          (await options.visibility?.can?.(APP_PERMISSIONS.PATIENT_PRIVATE_ALBUM_READ)) ?? true;
        return {
          general: counts.get(PATIENT_IMAGE_ALBUM.GENERAL) ?? 0,
          lhr: counts.get(PATIENT_IMAGE_ALBUM.LHR) ?? 0,
          ...(canSeePrivate ? { private: counts.get(PATIENT_IMAGE_ALBUM.PRIVATE) ?? 0 } : {}),
        };
      },
    });
    return { ...page, meta: { album_counts: albumCounts } };
  }
}
