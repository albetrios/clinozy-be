import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { OnboardingSetupService } from './onboarding-setup.service.js';
import { createOnboardingSetupController } from './onboarding-setup.controller.js';
import { ChangeOnboardingSetupDto } from './onboarding-setup.dto.js';

/**
 * Registers `GET`/`PATCH /app/onboarding-setup` and `POST /app/onboarding-setup/complete` (prefix
 * `/api/v1/app`) — feat-clinic-setup routes-final §2.A, routes 1–3. Managers only
 * (`organization:update`), team organizations only.
 */
export function onboardingSetupRoutes(service: OnboardingSetupService): FastifyPluginAsync {
  const controller = createOnboardingSetupController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/onboarding-setup',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get clinic setup',
          description:
            "The clinic's setup — the 3-tap drawer and the short guide behind the profile icon: `answered_steps` (`clinic_type`, `you`), `skipped_items`, `main_branch_id`, `next_step` (`clinic_type` · `location` · `you` · `go_live`, null once live), `live_checks` (clinic type, a main branch, a service), `is_live`, `has_someone_to_book` (a Doctor or Therapist), the three `guide_items` (`treatments`, `invite_team`, `first_appointment`) each with `is_done` read from the clinic's records, `is_skipped` and `can_skip`, the guide's count, and the times. The first read that finds every guide item done or skipped on a live clinic stores `guide_done_at`. A personal workspace has no clinic setup: a 404 `team_organization_required`. Requires organization:update (Owner, Admin).",
          tags: ['Onboarding setup'],
        },
      },
      controller.getSetup,
    );
    zodApplication.patch(
      '/onboarding-setup',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change clinic setup',
          description:
            'Merges one change, never overwriting what another admin saved: `answered_steps_add` (`clinic_type`, `you`), `skipped_items_add` / `skipped_items_remove` (`treatments`, `invite_team` — the first appointment cannot be skipped), `deferred: true` ("Explore first" — the drawer stops opening by itself), `guide_hidden` (hide or reopen the guide); at least one is required. `expected_updated_at` older than the stored setup is a 409 `record_changed`. Answers with the setup. A personal workspace is a 422. Requires organization:update.',
          tags: ['Onboarding setup'],
          body: ChangeOnboardingSetupDto,
        },
      },
      controller.changeSetup,
    );
    zodApplication.post(
      '/onboarding-setup/complete',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Go live',
          description:
            'Takes the clinic live: refused with a 409 `onboarding_setup_incomplete` (naming each) while the clinic type is unanswered, there is no active main branch or no active service; someone to book is not required. Records when and who, once — a clinic already live answers as it stands. The client creates the Consultations through the offerings route first; the server holds no starter list. A personal workspace is a 422. Requires organization:update.',
          tags: ['Onboarding setup'],
        },
      },
      controller.completeSetup,
    );
  };
}
