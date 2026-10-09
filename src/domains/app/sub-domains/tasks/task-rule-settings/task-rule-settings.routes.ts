// hand-edited — the task rule list routes.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { TaskRuleSettingsService } from './task-rule-settings.service.js';
import { createTaskRuleSettingsController } from './task-rule-settings.controller.js';
import { ReplaceTaskRulesDto } from './task-rule-settings.dto.js';

/** Registers `GET`/`PUT /app/task-rule-settings` (prefix `/api/v1/app`) — routes-final 10.B, routes 11–12. */
export function taskRuleSettingsRoutes(service: TaskRuleSettingsService): FastifyPluginAsync {
  const controller = createTaskRuleSettingsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/task-rule-settings',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List task rules',
          description:
            'Returns all fourteen task rules — the Rules popover — in their order, each with `is_on`, `is_automatic` ("Let the app handle") and `can_be_automatic` (confirm, payment_due, feedback and gone_quiet have a step the app can take); a rule never saved answers its default (`id` and `updated_at` null: on, by hand). A rule that is off hides its tasks from every tab. Requires task:read.',
          tags: ['Task'],
        },
      },
      controller.listRules,
    );
    zodApplication.put(
      '/task-rule-settings',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Save task rules',
          description:
            'Saves the sent rules in one transaction: `rules*` (1–14, each once — a 400 `rules` otherwise) with `is_on` and `is_automatic` — "Let the app handle" only on a rule with a step it can take (a 400 `is_automatic`); a switch or rule not sent keeps its value. Answers with all fourteen. Requires organization:update (Owner, Admin).',
          tags: ['Task'],
          body: ReplaceTaskRulesDto,
        },
      },
      controller.replaceRules,
    );
  };
}
