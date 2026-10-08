import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { MemberRoleService } from './member-role.service.js';
import type { MemberRolePermissionService } from './member-role-permission/member-role-permission.service.js';
import { createMemberRoleController } from './member-role.controller.js';
import { createMemberRolePermissionController } from './member-role-permission/member-role-permission.controller.js';
import {
  createMemberRoleDto,
  deleteMemberRoleQueryDto,
  roleIdParamsDto,
  updateMemberRoleDto,
} from './member-role.dto.js';
import { putMemberRolePermissionsDto } from './member-role-permission/member-role-permission.dto.js';

/** Services required to wire the member-role and role-permission routes. */
export interface MemberRoleRoutesDeps {
  memberRoleService: MemberRoleService;
  memberRolePermissionService: MemberRolePermissionService;
}

/**
 * Fastify plugin that registers the active organization's roles (launch §2.D): list, get, create,
 * change, delete with why, restore (T12), plus the nested `:role_id/permissions` read and replace.
 * One code set gates them (T8): `role:read|create|update|delete`, resolved against the signed JWT
 * `org` claim; every `POST` takes `X-Idempotency-Key` (T13).
 */
export function memberRoleRoutes(deps: MemberRoleRoutesDeps): FastifyPluginAsync {
  const roleController = createMemberRoleController(deps.memberRoleService);
  const permissionController = createMemberRolePermissionController(
    deps.memberRolePermissionService,
  );

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    // Member Role CRUD
    zodApplication.get(
      '/organization/roles',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ROLE_READ)],
        schema: {
          summary: 'List roles',
          description:
            "The organization's roles with their member counts: q (name), sort name (default) or created_at, order, limit, after. Requires role:read.",
          tags: ['Role'],
        },
      },
      roleController.listRoles,
    );
    zodApplication.get<{ Params: { role_id: string } }>(
      '/organization/roles/:role_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ROLE_READ)],
        schema: {
          summary: 'Get role',
          description: 'One role with its member count. Requires role:read.',
          tags: ['Role'],
          params: roleIdParamsDto,
        },
      },
      roleController.getRole,
    );
    zodApplication.post(
      '/organization/roles',
      {
        // sec-r5-ratelimit-dos-2: per (organization, actor) cap on custom-role creation
        // so an Admin-role-holder cannot churn unbounded role rows. Parity with
        // sec-r4-I2 / sec-r4-I3 on every other organization-scoped mutation. The
        // sec-r4-D4 .limit(256) on `findByRoleId` already caps per-role read
        // memory; this caps the rate at which new rows can be created.
        config: { idempotencyRequired: true, ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config },
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ROLE_CREATE)],
        schema: {
          summary: 'Create role',
          description:
            'Creates a custom role — optionally with permission_codes and the codes of copy_from_role_id. You can only hand out codes you hold. Requires role:create.',
          tags: ['Role'],
          body: createMemberRoleDto,
        },
      },
      roleController.createRole,
    );
    zodApplication.patch<{ Params: { role_id: string } }>(
      '/organization/roles/:role_id',
      {
        // R4: organization-scoped admin mutation — cap per (organization, actor).
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ROLE_UPDATE)],
        schema: {
          summary: 'Update role',
          description:
            'Renames or recolours a role, or changes its description; a system role keeps its name. expected_updated_at refuses a stale save. Requires role:update.',
          tags: ['Role'],
          params: roleIdParamsDto,
          body: updateMemberRoleDto,
        },
      },
      roleController.updateRole,
    );
    zodApplication.delete<{ Params: { role_id: string } }>(
      '/organization/roles/:role_id',
      {
        // R4: organization-scoped admin mutation — cap per (organization, actor).
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ROLE_DELETE)],
        schema: {
          summary: 'Delete role',
          description:
            'Deletes a custom role, with why: reason (mistake, duplicate, not_needed, other) and a note, required for other. System roles cannot be deleted; a role someone holds is a 409. Undo with POST …/restore until it is purged. Requires role:delete.',
          tags: ['Role'],
          params: roleIdParamsDto,
          querystring: deleteMemberRoleQueryDto,
        },
      },
      roleController.deleteRole,
    );
    zodApplication.post<{ Params: { role_id: string } }>(
      '/organization/roles/:role_id/restore',
      {
        // R4: organization-scoped admin mutation — cap per (organization, actor); T13: idempotent.
        config: { idempotencyRequired: true, ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config },
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ROLE_DELETE)],
        schema: {
          summary: 'Restore role',
          description:
            'Undoes a role delete until it is purged. A live role is a 409, as is a name another role took meanwhile. Requires role:delete.',
          tags: ['Role'],
          params: roleIdParamsDto,
        },
      },
      roleController.restoreRole,
    );

    // Member Role Permissions
    zodApplication.get<{ Params: { role_id: string } }>(
      '/organization/roles/:role_id/permissions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ROLE_READ)],
        schema: {
          summary: 'List role permissions',
          description: "A role's codes, with when it got each one. Requires role:read.",
          tags: ['Permission'],
          params: roleIdParamsDto,
        },
      },
      permissionController.listRolePermissions,
    );
    zodApplication.put<{ Params: { role_id: string } }>(
      '/organization/roles/:role_id/permissions',
      {
        // R4: organization-scoped admin mutation (full permission-set replace) — cap per (organization, actor).
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ROLE_UPDATE)],
        schema: {
          summary: 'Replace role permissions',
          description:
            "Replaces a role's codes with the given set (each code once) and returns them. You can only hand out codes you hold; the Admin and Owner roles' codes never change. Requires role:update.",
          tags: ['Permission'],
          params: roleIdParamsDto,
          body: putMemberRolePermissionsDto,
        },
      },
      permissionController.putRolePermissions,
    );
  };
}
