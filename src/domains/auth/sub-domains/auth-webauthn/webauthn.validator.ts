import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import {
  webauthnAuthenticateOptionsDto,
  webauthnAuthenticateVerifyDto,
  webauthnRegisterVerifyDto,
} from './webauthn.dto.js';

/** Validates the `POST /api/v1/auth/webauthn/authenticate/options` request body against {@link webauthnAuthenticateOptionsDto}; throws `ValidationError` on failure. */
export function validateWebauthnAuthenticateOptions(body: unknown) {
  return parseWithSchema({ schema: webauthnAuthenticateOptionsDto, data: body ?? {} });
}

/** Validates the `POST /api/v1/auth/me/webauthn/register/verify` request body against {@link webauthnRegisterVerifyDto}; throws `ValidationError` on failure. */
export function validateWebauthnRegisterVerify(body: unknown) {
  return parseWithSchema({ schema: webauthnRegisterVerifyDto, data: body });
}

/** Validates the `POST /api/v1/auth/webauthn/authenticate/verify` request body against {@link webauthnAuthenticateVerifyDto}; throws `ValidationError` on failure. */
export function validateWebauthnAuthenticateVerify(body: unknown) {
  return parseWithSchema({ schema: webauthnAuthenticateVerifyDto, data: body });
}

/** Validates the `:credential_id` path param on `DELETE /api/v1/auth/me/webauthn/credentials/{credential_id}` as an opaque public id; throws `ValidationError` on failure. */
export function validateWebauthnCredentialIdParam(credentialId: string): string {
  return validatePublicIdParam({ value: credentialId, fieldName: 'credential_id' });
}
