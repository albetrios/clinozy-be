import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { ForbiddenError } from '@/shared/errors/index.js';
import { PATIENT_IMAGE_ALBUM_VALUES } from './patient-images.constants.js';

/** The album only `private_album:read` holders see. */
const PRIVATE_ALBUM = 'private';
/** The albums every reader of the patient file sees. */
const SHARED_ALBUMS = PATIENT_IMAGE_ALBUM_VALUES.filter((album) => album !== PRIVATE_ALBUM);

/** Refuses a photo into (or out of) the Private album from a caller who may not see it. */
async function assertAlbumAllowed(album: unknown, context: BaseRecordWriteContext): Promise<void> {
  if (album !== PRIVATE_ALBUM) return;
  if (!(await context.can(APP_PERMISSIONS.PRIVATE_ALBUM_READ))) {
    throw new ForbiddenError('errors:fieldNeedsPermission').withReason('field_permission_required');
  }
}

/**
 * The patient images rules (launch ROUTE #67, patient-file.4, P46): the Private album is seen and
 * written only by `private_album:read` holders (Doctor and Admin by default).
 *
 * @remarks
 * - **Algorithm:** the read scope keeps other callers to the shared albums on every list and
 *   read by id (a Private photo is a 404 to them); a create or move into the Private album needs
 *   the code.
 * - **Failure modes:** `ForbiddenError('field_permission_required')`.
 */
export const patientImagesRules: BaseRecordRules = {
  readScope: async (can) =>
    (await can(APP_PERMISSIONS.PRIVATE_ALBUM_READ)) ? undefined : { album: SHARED_ALBUMS },
  prepareCreate: (values, context) => assertAlbumAllowed(values.album, context),
  prepareUpdate: (values, _existing, context) => assertAlbumAllowed(values.album, context),
};
