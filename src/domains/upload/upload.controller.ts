import type { FastifyReply, FastifyRequest } from 'fastify';
import { getRequestIdentifier, requireAuth } from '@/shared/utils/http/request.util.js';
import { successResponse } from '@/shared/utils/http/response.util.js';
import { ForbiddenError } from '@/shared/errors/index.js';
import { assertOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { UPLOAD_PERMISSIONS } from './upload.permissions.js';
import type { UploadService } from './upload.service.js';
import type { UploadPrincipal } from './upload.types.js';
import { validateCreateUpload } from './upload.validator.js';

/**
 * The caller's active organization from the signed `org` claim, or `null` when they are in
 * their personal space.
 *
 * @remarks
 * `upload.uploads` splits across two disjoint RLS arms — a user-owned arm and a tenant arm —
 * so the service needs to know whether an organization arm is even available before it can
 * look an organization-scoped upload up. Optional by design: a personal upload resolves
 * without it.
 */
function activeOrganizationPublicId(request: FastifyRequest): string | null {
  return (request as FastifyRequest & { organizationId?: string | null }).organizationId ?? null;
}

/**
 * The request's {@link UploadPrincipal}: an organization upload belongs to the active organization
 * (the signed claim), and `upload:manage` is checked there the way every organization route checks a
 * permission — API-key scopes, the organization's MFA requirement, a deny audit row.
 */
function uploadPrincipal(request: FastifyRequest): UploadPrincipal {
  const auth = requireAuth(request);
  const organizationPublicId = activeOrganizationPublicId(request);
  return {
    userPublicId: auth.userId,
    organizationPublicId,
    authorizeOrganization: async (targetOrganizationPublicId) => {
      if (targetOrganizationPublicId !== organizationPublicId) {
        throw new ForbiddenError('errors:uploadOrganizationNotActive');
      }
      await assertOrganizationPermission({
        request,
        permissionCode: UPLOAD_PERMISSIONS.UPLOAD_MANAGE,
      });
    },
  };
}

/**
 * HTTP handlers for the upload routes: request a presigned URL, fetch metadata,
 * confirm completion, and soft-delete an upload. Each hands the service the request's
 * {@link UploadPrincipal}; the service checks ownership, and calls the principal's organization
 * authorization for an organization upload.
 */
export function createUploadController(uploadService: UploadService) {
  return {
    createUpload: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = validateCreateUpload(request.body);
      const result = await uploadService.createUpload({
        input,
        principal: uploadPrincipal(request),
      });
      return reply
        .status(200)
        .send(successResponse({ data: result, request_id: getRequestIdentifier(request) }));
    },

    getUpload: async (request: FastifyRequest, reply: FastifyReply) => {
      const publicId = (request.params as { upload_id: string }).upload_id;
      const result = await uploadService.getUpload({
        public_id: publicId,
        principal: uploadPrincipal(request),
      });
      return reply.send(
        successResponse({ data: result, request_id: getRequestIdentifier(request) }),
      );
    },

    confirmUpload: async (request: FastifyRequest, reply: FastifyReply) => {
      const publicId = (request.params as { upload_id: string }).upload_id;
      const result = await uploadService.confirmUpload({
        public_id: publicId,
        principal: uploadPrincipal(request),
      });
      return reply.send(
        successResponse({ data: result, request_id: getRequestIdentifier(request) }),
      );
    },

    deleteUpload: async (request: FastifyRequest, reply: FastifyReply) => {
      const publicId = (request.params as { upload_id: string }).upload_id;
      await uploadService.deleteUpload({
        public_id: publicId,
        principal: uploadPrincipal(request),
      });
      return reply.code(204).send();
    },
  };
}
