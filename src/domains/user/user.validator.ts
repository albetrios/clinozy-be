import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  UpdateMeDto,
  ListUsersDto,
  AdminUpdateUserDto,
  UploadAvatarDto,
  type UpdateMeInput,
  type ListUsersInput,
  type AdminUpdateUserInput,
  type UploadAvatarInput,
} from './user.dto.js';

/** Validate the `PATCH /api/v1/users/me` body against {@link UpdateMeDto}; throws `ValidationError` on failure. */
export function validateUpdateMe(body: unknown): UpdateMeInput {
  return parseWithSchema({ schema: UpdateMeDto, data: body });
}

/**
 * Validate the admin `GET /api/v1/users` query string against the strict {@link ListUsersDto}
 * (cursor pagination only — an unknown key such as `page` is a validation error).
 */
export function validateListUsers(query: unknown): ListUsersInput {
  return parseWithSchema({ schema: ListUsersDto, data: query });
}

/** Validate the admin `PATCH /api/v1/users/:user_id` body against {@link AdminUpdateUserDto}. */
export function validateAdminUpdateUser(body: unknown): AdminUpdateUserInput {
  return parseWithSchema({ schema: AdminUpdateUserDto, data: body });
}

/** Validate the `PUT /api/v1/users/me/avatar` body against {@link UploadAvatarDto}. */
export function validateUploadAvatar(body: unknown): UploadAvatarInput {
  return parseWithSchema({ schema: UploadAvatarDto, data: body });
}
