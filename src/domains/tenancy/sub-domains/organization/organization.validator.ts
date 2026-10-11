import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  createOrganizationDto,
  updateOrganizationDto,
  listOrganizationsQueryDto,
  uploadLogoDto,
} from './organization.dto.js';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListOrganizationsQueryInput,
  UploadLogoInput,
} from './organization.dto.js';

/** Parses raw `POST /organizations` body via {@link createOrganizationDto}; throws `ValidationError('errors:invalidInput')` on failure. */
export function validateCreateOrganization(data: unknown): CreateOrganizationInput {
  return parseWithSchema({ schema: createOrganizationDto, data });
}

/** Parses raw `PATCH /organization` body via {@link updateOrganizationDto}; throws `ValidationError('errors:invalidInput')` on failure. */
export function validateUpdateOrganization(data: unknown): UpdateOrganizationInput {
  return parseWithSchema({ schema: updateOrganizationDto, data });
}

/**
 * Validates the `GET /organizations` query string against the strict
 * {@link listOrganizationsQueryDto} (cursor pagination only). Throws
 * `ValidationError('errors:validation.invalidPagination')` on failure.
 */
export function validateListOrganizationsQuery(data: unknown): ListOrganizationsQueryInput {
  return parseWithSchema({
    schema: listOrganizationsQueryDto,
    data,
    errorKey: 'errors:validation.invalidPagination',
  });
}

/** Parses raw `PUT /organization/logo` body via {@link uploadLogoDto}; throws `ValidationError('errors:invalidInput')` on failure. */
export function validateUploadLogo(data: unknown): UploadLogoInput {
  return parseWithSchema({ schema: uploadLogoDto, data });
}
