import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { DayClosesService } from './day-closes.service.js';
import { createDayClosesController } from './day-closes.controller.js';
import {
  CloseDayCloseDto,
  CreateDayCloseDto,
  ReopenDayCloseDto,
  dayClosesIdParamsDto,
  listDayClosesQueryDto,
} from './day-closes.dto.js';

/** The by-id routes' path params. */
type DayCloseParams = { Params: { day_close_id: string } };

/** What every day close answers with. */
const DAY_CLOSE_FIGURES =
  'the opening cash and who accepted it, the live figures — `cash_in`, `cash_out`, `expected_cash` (live while open: opening + cash received − cash paid), `net_by_mode`, `by_member`, `entry_count` — the count, `difference` and its reason once closed, and `events` (what happened)';

/**
 * Registers the `day-closes` routes (prefix `/api/v1/app`) — routes-final 8.E, routes 28–32.
 */
export function dayClosesRoutes(service: DayClosesService): FastifyPluginAsync {
  const controller = createDayClosesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/day-closes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List day closes',
          description: `Returns one page of past and open days, each with ${DAY_CLOSE_FIGURES}. Filters \`branch_id\` (several, comma-separated), \`status\` (\`open\` · \`closed\`), \`close_date_from\` / \`close_date_to\` (inclusive); sort \`close_date\` (default, newest first) or \`created_at\`. Another branch's days only with branch:read (B4). Requires payment:read.`,
          tags: ['Payment'],
          querystring: listDayClosesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/day-closes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Open the day',
          description:
            "Opens a branch's day: `branch_id*` (one of yours); optional `close_date` (default the organization's today — never in the future nor more than 120 days back, a 400), `opening_source` (`carried` default — the branch's last counted cash, 0 for the first — or `recounted`) and `opening_cash` (a recount's — required then, refused otherwise: a 400). Records who accepted the opening and an `opened` (and `recounted`) event. A branch's day already open or closed is a 409 `record_already_exists`. Requires payment:update.",
          tags: ['Payment'],
          body: CreateDayCloseDto,
        },
      },
      controller.create,
    );
    zodApplication.get<DayCloseParams>(
      '/day-closes/:day_close_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a day close',
          description: `Returns one branch's day with ${DAY_CLOSE_FIGURES}. Another branch's without branch:read is a 404. Requires payment:read.`,
          tags: ['Payment'],
          params: dayClosesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.post<DayCloseParams>(
      '/day-closes/:day_close_id/close',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Close the day',
          description:
            "Counts and closes an open day: `counted_cash*`; `difference_reason` (1–280 — required when the count differs from the expected cash, a 400). Stores the expected cash (opening + cash received − cash paid in the day's live payments), the difference and who closed it, records a `closed` event, and locks the day — its payments can no longer be added, changed, deleted or restored (B6). A closed day is a 409 `transition_not_allowed`. Requires payment:update.",
          tags: ['Payment'],
          params: dayClosesIdParamsDto,
          body: CloseDayCloseDto,
        },
      },
      controller.transition('close'),
    );
    zodApplication.post<DayCloseParams>(
      '/day-closes/:day_close_id/reopen',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Reopen a closed day',
          description:
            'Reopens a closed day with `reason*` (1–280 — kept on the `reopened` event); the count is cleared and the next close recomputes. An open day is a 409 `transition_not_allowed`. Requires payment:delete.',
          tags: ['Payment'],
          params: dayClosesIdParamsDto,
          body: ReopenDayCloseDto,
        },
      },
      controller.transition('reopen'),
    );
  };
}
