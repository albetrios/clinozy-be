// hand-edited — the task rule list routes.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { TaskRuleSettingsService } from './task-rule-settings.service.js';
import { createTaskRuleSettingsController } from './task-rule-settings.controller.js';
import { ReplaceTaskRulesDto } from './task-rule-settings.dto.js';

/** Registers `GET`/`PUT /app/task-rule-settings` (prefix `/api/v1/app`). */
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
            'Returns every task rule with whether it is on and whether Clinozy handles it by itself — the saved setting, or the default (id null: on, not automatic).',
          tags: ['Task'],
        },
      },
      controller.listRules,
    );
    zodApplication.put(
      '/task-rule-settings',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_RULE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Save task rules',
          description:
            'Switches the named rules on or off and sets "Clinozy handles it"; the rules not named keep their setting. Returns the whole rule list. Owner and Admin (A22).',
          tags: ['Task'],
          body: ReplaceTaskRulesDto,
        },
      },
      controller.replaceRules,
    );
  };
}
