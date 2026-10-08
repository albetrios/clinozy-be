import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { ContactMembersService } from './contact-members.service.js';
import { createContactMembersController } from './contact-members.controller.js';
import { contactMembersParamsDto, ReplaceContactMembersDto } from './contact-members.dto.js';

/** Registers the `/app/contacts/{contact_id}/members` routes (prefix `/api/v1/app`) — routes-final 4.B, routes 8–9. */
export function contactMembersRoutes(service: ContactMembersService): FastifyPluginAsync {
  const controller = createContactMembersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/members',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List contact members',
          description:
            'Returns the team members who handle this person (team member ids and when each was added), oldest first (CT11). Requires contact:read.',
          tags: ['Contact'],
          params: contactMembersParamsDto,
        },
      },
      controller.listContactMembers,
    );
    zodApplication.put<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/members',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Replace contact members',
          description:
            'Makes `membership_ids` (0–50, each once) the exact list of who handles this person; an empty list removes everyone. Every id must be a live member of the organization — a 400 naming it otherwise (CT11). Requires contact:update.',
          tags: ['Contact'],
          params: contactMembersParamsDto,
          body: ReplaceContactMembersDto,
        },
      },
      controller.replaceContactMembers,
    );
  };
}
