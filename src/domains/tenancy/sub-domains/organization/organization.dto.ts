import { z } from 'zod';
import { cursorPaginationSchema } from '@/shared/utils/http/pagination.util.js';
import {
  trimmedSlug,
  trimmedStringMinMax,
  isTraversalFreeStorageKey,
} from '@/shared/utils/validation/validation.util.js';
import { isKnownTimeZone } from '@/shared/utils/validation/record-fields.util.js';
import {
  ORGANIZATION_SPECIALTIES,
  ORGANIZATION_SPECIALTIES_MAX_COUNT,
  type OrganizationSpecialty,
} from './organization.constants.js';

/** Path params for `/organizations/by-slug/:slug` (URL-friendly organization slug). */
export const organizationSlugParamsDto = z
  .object({
    slug: trimmedSlug(),
  })
  .strict();

/** Path params for member-role routes scoped under the active organization (`/organization/roles/:role_id`). */
export const roleIdParamsDto = z
  .object({
    role_id: trimmedStringMinMax({ min: 1, max: 28 }),
  })
  .strict();

/** Path params for organization API-key routes (`/organization/api-keys/:api_key_id`). */
export const apiKeyIdParamsDto = z
  .object({
    api_key_id: trimmedStringMinMax({ min: 1, max: 28 }),
  })
  .strict();

/** Path params for notification-policy routes (`/organization/notification-policies/:notification_policy_id`). */
export const notificationPolicyIdParamsDto = z
  .object({
    notification_policy_id: trimmedStringMinMax({ min: 1, max: 28 }),
  })
  .strict();

/** Zod schema for the `POST /api/v1/organizations` request body (name + URL-friendly slug). */
export const createOrganizationDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 255 }),
    slug: trimmedSlug(),
  })
  .strict();

/**
 * Zod schema for the `PATCH /api/v1/organization` request body. All
 * fields optional; `status` is constrained to the lifecycle values stored
 * in `tenancy.organizations.status`.
 */
export const updateOrganizationDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 255 }).optional(),
    slug: trimmedSlug().optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
    specialties: z
      .array(
        z.enum(ORGANIZATION_SPECIALTIES as [OrganizationSpecialty, ...OrganizationSpecialty[]]),
      )
      .min(1)
      .max(ORGANIZATION_SPECIALTIES_MAX_COUNT)
      .refine((values) => new Set(values).size === values.length, {
        message: 'errors:validation.eachSpecialtyOnce',
      })
      .optional(),
    timezone: trimmedStringMinMax({ min: 1, max: 64 })
      .refine(isKnownTimeZone, { message: 'errors:validation.notIanaTimeZone' })
      .optional(),
  })
  .strict();

/** Zod schema for the `GET /api/v1/organizations` query string — cursor-based pagination only. */
export const listOrganizationsQueryDto = cursorPaginationSchema.strict();

/**
 * Zod schema for the `PUT /api/v1/organization/logo` request body.
 * Enforces that `key` lives under the `organization-logos/` S3 prefix; the
 * service additionally checks the key belongs to this organization.
 */
export const uploadLogoDto = z
  .object({
    key: trimmedStringMinMax({ min: 1, max: 512 })
      .refine((key) => key.startsWith('organization-logos/'), {
        message: 'errors:validation.organizationLogoKeyPrefix',
      })
      .refine(isTraversalFreeStorageKey, {
        message: 'errors:validation.storageKeyPathTraversal',
      }),
  })
  .strict();

/** DTO inferred from {@link organizationSlugParamsDto}. */
export type OrganizationSlugParamsInput = z.infer<typeof organizationSlugParamsDto>;
/** DTO inferred from {@link roleIdParamsDto}. */
export type RoleIdParamsInput = z.infer<typeof roleIdParamsDto>;
/** DTO inferred from {@link apiKeyIdParamsDto}. */
export type ApiKeyIdParamsInput = z.infer<typeof apiKeyIdParamsDto>;
/** DTO inferred from {@link notificationPolicyIdParamsDto}. */
export type NotificationPolicyIdParamsInput = z.infer<typeof notificationPolicyIdParamsDto>;
/** DTO inferred from {@link createOrganizationDto}. */
export type CreateOrganizationInput = z.infer<typeof createOrganizationDto>;
/** DTO inferred from {@link updateOrganizationDto}. */
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationDto>;
/** DTO inferred from {@link listOrganizationsQueryDto}. */
export type ListOrganizationsQueryInput = z.infer<typeof listOrganizationsQueryDto>;
/** DTO inferred from {@link uploadLogoDto}. */
export type UploadLogoInput = z.infer<typeof uploadLogoDto>;
