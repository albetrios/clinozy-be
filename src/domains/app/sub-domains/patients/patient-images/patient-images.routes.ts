import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientImagesService } from './patient-images.service.js';
import { createPatientImagesController } from './patient-images.controller.js';
import {
  CreatePatientImageDto,
  UpdatePatientImageDto,
  listPatientImagesQueryDto,
  patientImagesIdParamsDto,
  patientImagesParentParamsDto,
} from './patient-images.dto.js';

/** The by-id routes' path params. */
type ImageParams = { Params: { patient_id: string; patient_image_id: string } };

/**
 * Registers the `patient-images` routes (prefix `/api/v1/app`) — routes-final 7.F, routes
 * 33–38, nested under the patient.
 */
export function patientImagesRoutes(service: PatientImagesService): FastifyPluginAsync {
  const controller = createPatientImagesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/images',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's photos",
          description:
            'Returns one page of a patient\'s photos (newest `taken_on` first; `sort=created_at` by upload), each with its visit\'s `service_label` (the date groups) `file_url` — a link that shows the full photo, valid 15 minutes and made fresh on every read (null when its upload is gone, D86) — and `thumbnail_url` — the image a photo grid shows: a 15-minute link to its 320 px thumbnail, or the link of the full photo while it has none — and `meta.album_counts` — the live photos per album you can see (`general`, `lhr`, and `private` only with the album code — the tab counts, P26). Filters: `album` (the tab; none = every album you can see), `appointment_id`, `has_appointment=false` ("Not attached to a visit"), `patient_treatment_id`, `stage`, `body_part`, `q` (the name or file name), the created range. A private photo shows only to patient:private_album:read holders (P23). Requires patient:clinical_record:read (P14).',
          tags: ['Patient file'],
          params: patientImagesParentParamsDto,
          querystring: listPatientImagesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/images',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
        ],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a photo',
          description:
            "Files a confirmed upload as a photo: `file_key` — a confirmed JPG or PNG of the organization, up to 15 MB (a 400 otherwise; its `file_name` is the upload's, P19, P25), filed once (a 409 `image_exists`); optional `album` (`general` default · `private` — needs patient:private_album:read, a 403 `field_permission_required` otherwise · `lhr`), `stage` (`before` · `after`), `appointment_id` (a checked-in or completed visit of the patient's — a 400 otherwise), `patient_treatment_id` (a session of the patient's, P24), `body_part` (the patient file's 15 parts), `taken_on` (default today, never in the future), `display_name` (≤ 60), `caption` (≤ 200). A `system` entry joins the contact's activity — a private photo's for the album's holders only (M10). A 320 px thumbnail is made in the background after the photo is filed: `thumbnail_url` is the full photo's link until it exists, and a failed thumbnail never fails the add. Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientImagesParentParamsDto,
          body: CreatePatientImageDto,
        },
      },
      controller.create,
    );
    zodApplication.get<ImageParams>(
      '/patients/:patient_id/images/:patient_image_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a photo',
          description:
            "Returns one of a patient's photos, with `file_url` (a 15-minute link that shows the full photo, D86) and `thumbnail_url` (its thumbnail's, else the full photo's) — another patient's, or a private one without the album code, is a 404. Requires patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientImagesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<ImageParams>(
      '/patients/:patient_id/images/:patient_image_id',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
        ],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change or move a photo',
          description:
            "Changes a photo's details or moves it to another album — any of the add fields but `file_key` (at least one; null clears an optional one), with the same checks. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientImagesIdParamsDto,
          body: UpdatePatientImageDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<ImageParams>(
      '/patients/:patient_id/images/:patient_image_id',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
        ],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a photo',
          description:
            'Deletes a photo with why: `reason` (mistake — "Wrong patient", duplicate, not_needed — "Blurry / retake", other) and a `note`, required for other (P25). Its thumbnail is removed in the background (the full photo stays). Restorable until the organization\'s purge window ends (D38). Requires patient:update and patient:clinical_record:read (P14).',
          tags: ['Patient file'],
          params: patientImagesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<ImageParams>(
      '/patients/:patient_id/images/:patient_image_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
        ],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a photo',
          description:
            "Undoes a photo's delete. Its thumbnail is made again in the background. A live photo is a 409 `record_not_deleted`. Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientImagesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
