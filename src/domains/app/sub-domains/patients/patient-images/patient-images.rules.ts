import { toText } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { requireConfirmedUploads } from '@/domains/app/base-record.service.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { ContactActivitiesRepository } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.repository.js';
import { patientFileValueLabel } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  assertAppointmentOfPatient,
  assertDateNotFuture,
  assertTreatmentOfPatient,
  organizationToday,
  writePatientFileActivity,
} from '@/domains/app/sub-domains/patients/patients.rules.js';
import { fieldValidationError, ForbiddenError } from '@/shared/errors/index.js';
import {
  PATIENT_IMAGE_ALBUM,
  PATIENT_IMAGE_ALBUM_VALUES,
  PATIENT_IMAGE_FILE_NAME_MAX,
  PATIENT_IMAGE_MAX_BYTES,
  PATIENT_IMAGE_MIME_TYPES,
} from './patient-images.constants.js';
import type { PatientImagesRepository } from './patient-images.repository.js';

const contactActivitiesRepository = new ContactActivitiesRepository();

/** The albums every holder of the clinical code sees (P23). */
const SHARED_ALBUMS = PATIENT_IMAGE_ALBUM_VALUES.filter(
  (album) => album !== PATIENT_IMAGE_ALBUM.PRIVATE,
);

/** Refuses a photo into the private album from a caller without the album code (P23). */
async function assertAlbumAllowed({
  album,
  context,
}: {
  album: unknown;
  context: BaseRecordWriteContext;
}): Promise<void> {
  if (album !== PATIENT_IMAGE_ALBUM.PRIVATE) return;
  if (!(await context.can(APP_PERMISSIONS.PATIENT_PRIVATE_ALBUM_READ))) {
    throw new ForbiddenError('errors:fieldNeedsPermission', {
      field: 'album',
      permission: APP_PERMISSIONS.PATIENT_PRIVATE_ALBUM_READ,
    }).withReason('field_permission_required');
  }
}

/**
 * The upload is a confirmed JPG or PNG of the organization, up to 15 MB (P19, P25) — else a 400 on
 * `file_key`; returns its file name, cut to the column.
 */
async function requirePhotoUpload({
  fileKey,
  context,
}: {
  fileKey: string;
  context: BaseRecordWriteContext;
}): Promise<string> {
  const [upload] = await requireConfirmedUploads({
    fileKeys: [fileKey],
    field: 'file_key',
    context,
  });
  if (!(upload && PATIENT_IMAGE_MIME_TYPES.includes(upload.mimeType))) {
    throw fieldValidationError({
      field: 'file_key',
      messageKey: 'errors:validation.patientImageUploadType',
    });
  }
  if (upload.fileSize > PATIENT_IMAGE_MAX_BYTES) {
    throw fieldValidationError({
      field: 'file_key',
      messageKey: 'errors:validation.patientImageUploadTooLarge',
    });
  }
  return upload.fileName.slice(0, PATIENT_IMAGE_FILE_NAME_MAX);
}

/** The links a photo's write checks: its visit (checked in or completed) and its session. */
async function assertLinks({
  values,
  patientId,
}: {
  values: Record<string, unknown>;
  patientId: number;
}): Promise<void> {
  if ('appointment_id' in values) {
    await assertAppointmentOfPatient({
      appointmentId: values.appointment_id,
      patientId,
      requireVisit: true,
    });
  }
  if ('patient_treatment_id' in values) {
    await assertTreatmentOfPatient({ treatmentId: values.patient_treatment_id, patientId });
  }
}

/**
 * The patient image rules (launch ROUTE #133, routes-final 7.F): the private album is its holders'
 * alone, the upload is a confirmed photo filed once, the links are the patient's, and a new photo
 * shows in the contact's activity.
 *
 * @remarks
 * - **Algorithm:** the read scope keeps callers without `patient:private_album:read` to the shared
 *   albums on every list, read, write and restore (a private photo is a 404 to them, P23); a create
 *   or move into the private album needs the code. A create checks the upload (P19, P25 — its
 *   file name is the upload's), defaults `taken_on` to the organization's today; a create or change
 *   refuses a future `taken_on`, another contact's or an unvisited appointment, another patient's
 *   session. After a create a `system` entry links the photo in the contact's activity — a private
 *   one marked so only the album's holders see it; a move in or out of the album re-marks its
 *   entries (M10, PC16). `decorate` adds each visit's `service_label` and each photo's `file_url` (one read each per page, D86).
 * - **Failure modes:** `ForbiddenError('field_permission_required')`; `ValidationError` on
 *   `file_key`, `taken_on`, `appointment_id` or `patient_treatment_id`.
 */
export function createPatientImagesRules(repository: PatientImagesRepository): BaseRecordRules {
  return {
    readScope: async (can) =>
      (await can(APP_PERMISSIONS.PATIENT_PRIVATE_ALBUM_READ))
        ? undefined
        : { album: SHARED_ALBUMS },
    prepareCreate: async (values, context) => {
      await assertAlbumAllowed({ album: values.album, context });
      values.file_name = await requirePhotoUpload({ fileKey: String(values.file_key), context });
      values.taken_on ??= await organizationToday(context);
      await assertDateNotFuture({
        date: values.taken_on,
        field: 'taken_on',
        messageKey: 'errors:validation.patientImageTakenOnFuture',
        context,
      });
      await assertLinks({ values, patientId: values.patient_id as number });
    },
    prepareUpdate: async (values, existing, context) => {
      await assertAlbumAllowed({ album: values.album, context });
      await assertDateNotFuture({
        date: values.taken_on,
        field: 'taken_on',
        messageKey: 'errors:validation.patientImageTakenOnFuture',
        context,
      });
      await assertLinks({ values, patientId: existing.patient_id as number });
    },
    afterWrite: async (row, change, context) => {
      const isPrivate = row.album === PATIENT_IMAGE_ALBUM.PRIVATE;
      if (change.kind === 'create') {
        await writePatientFileActivity({
          context,
          patientId: row.patient_id as number,
          body: `Photo added: ${patientFileValueLabel(String(row.album))} album`,
          link: { patient_image_id: row.id },
          isPrivatePhoto: isPrivate,
        });
      } else if (change.kind === 'update' && change.before?.album !== row.album) {
        await contactActivitiesRepository.setPrivatePhoto({
          patientImageId: row.id,
          isPrivate,
        });
      }
    },
    decorate: async (outputs, context) => {
      // D86: a link that shows each photo — only rows the caller may read reach here (P23)
      const links = await context.ports.fileReadUrls({
        organizationId: context.organizationId,
        fileKeys: outputs.map((output) => toText(output.file_key)),
      });
      for (const output of outputs) {
        output.file_url = links.get(toText(output.file_key))?.url ?? null;
      }
      const appointmentIds = [
        ...new Set(
          outputs.flatMap((output) =>
            output.appointment_id ? [toText(output.appointment_id)] : [],
          ),
        ),
      ];
      const labels = await repository.findServiceLabels(appointmentIds);
      for (const output of outputs) {
        output.service_label = output.appointment_id
          ? (labels.get(toText(output.appointment_id)) ?? null)
          : null;
      }
    },
  };
}
