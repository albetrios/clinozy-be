import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { createContactsController } from './contacts.controller.js';
import { contactIdParamsDto, listContactsQueryDto } from './contacts.dto.js';
import type { ContactsService } from './contacts.service.js';

/** Registers `GET /app/contacts` and `GET /app/contacts/{contact_id}/preview` (prefix `/api/v1/app`). */
export function contactsRoutes(service: ContactsService): FastifyPluginAsync {
  const controller = createContactsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/contacts',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List contacts',
          description:
            'Every person as one kind of record — patients, leads and walk-in buyers — matching q, or phone (who already has this mobile: the new-lead warning, never a block) (≥ 3 characters: a name, phone digits or a number), up to 5 per kind; kind narrows to one. Kinds the caller may not read are left out.',
          tags: ['Search'],
          querystring: listContactsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/preview',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Preview contact',
          description:
            'The hover preview of a patient (pat_…), lead (lead_…) or walk-in buyer (mcon_…): name, phone, number, the next and the last appointment in the organization’s own date, a lead’s status and converted patient. 404 for a kind the caller may not read.',
          tags: ['Search'],
          params: contactIdParamsDto,
        },
      },
      controller.preview,
    );
  };
}
