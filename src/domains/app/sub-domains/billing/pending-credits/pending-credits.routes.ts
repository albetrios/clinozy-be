import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PendingCreditsService } from './pending-credits.service.js';
import { createPendingCreditsController } from './pending-credits.controller.js';
import {
  CreatePendingCreditDto,
  SettlePendingCreditDto,
  UpdatePendingCreditDto,
  listPendingCreditsQueryDto,
  pendingCreditsIdParamsDto,
} from './pending-credits.dto.js';

/** The by-id routes' path params. */
type PendingCreditParams = { Params: { pending_credit_id: string } };

/**
 * Registers the `pending-credits` routes (prefix `/api/v1/app`) — routes-final 8.D, routes 21–27.
 */
export function pendingCreditsRoutes(service: PendingCreditsService): FastifyPluginAsync {
  const controller = createPendingCreditsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/pending-credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List pending credits',
          description:
            "Returns one page of the organization's pending credits — money owed to or by someone — each with the `contact` (or `party_name`), `settled_amount`, `left_amount`, `status`, `payment_ids` (its settlements) and `created_by_membership_id` (who recorded it). `q` is the typed party, the contact (a name, phone or contact number) or the number (`CR-2`); filters `direction`, `status` (several, comma-separated — `open` · `given_back` · `got_back` · `used`), `contact_id`, `invoice_id`, `settle_by_from` / `settle_by_to` (inclusive), the created range; sort `created_at` (default, newest first) or `settle_by`. Requires payment:read.",
          tags: ['Payment'],
          querystring: listPendingCreditsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/pending-credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a pending credit',
          description:
            'Records money owed: `direction*` (`give` — the clinic owes it · `take` — it is owed to the clinic), `amount*` (more than 0), `reason*` (1–280), and a `contact_id` or a `party_name` (≤ 120 — a 400 `party_name` with neither); optional `invoice_id` ("For invoice" — the contact\'s, a 400 otherwise), `source_payment_id`, `settle_by` (a date — sub-domain 10\'s reminder), `note` (≤ 300). It starts `open`. Requires payment:create.',
          tags: ['Payment'],
          body: CreatePendingCreditDto,
        },
      },
      controller.create,
    );
    zodApplication.get<PendingCreditParams>(
      '/pending-credits/:pending_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a pending credit',
          description:
            'Returns one pending credit with what is settled and left, and its settlements. Requires payment:read.',
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<PendingCreditParams>(
      '/pending-credits/:pending_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a pending credit',
          description:
            'Changes a pending credit while nothing of it is settled (a 409 `credit_settled`) — on the store credit a medical return left, only `note` and `settle_by` (a 409 `credit_of_return`): any field of the create, checked the same way (null clears an optional one). Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires payment:update.',
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
          body: UpdatePendingCreditDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<PendingCreditParams>(
      '/pending-credits/:pending_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a pending credit',
          description:
            'Deletes a pending credit while nothing of it is settled (a 409 `credit_settled`) and no medical return left it as store credit (a 409 `credit_of_return`), with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Requires payment:delete.',
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<PendingCreditParams>(
      '/pending-credits/:pending_credit_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a pending credit',
          description:
            "Undoes a pending credit's delete. A live one is a 409 `record_not_deleted`. Requires payment:delete.",
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
        },
      },
      controller.restore,
    );
    zodApplication.post<PendingCreditParams>(
      '/pending-credits/:pending_credit_id/settle',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Settle a pending credit',
          description:
            "Settles a part, up to what is left (a 400 `amount`): `amount*`, `method*` — `money` with `branch_id*`, `splits*` (cash · UPI · card, adding up to `amount`) and an optional `paid_at` (its day must be open, a 409 `day_closed`): a `give` pays a refund (with a credit note when the credit names an invoice — up to what it has paid, a 409 `more_than_paid`), a `take` records money back; or `use_on_bill` (a `give` only — a 400 `method`) with `invoice_id*` and no `branch_id`, `splits` or `paid_at` (a 400): a receipt on one of the party's invoices paid by the credit — one `credit` split of `amount`, no cash moving (the day's expected cash does not change) — at the invoice's branch, dated now (the organization's today); that day must be open there, a 409 `day_closed` (not the party's invoice, or nothing due, a 409 `nothing_due`; over its due a 409 `more_than_due`). The payment points at the credit; its settled amount follows and, once nothing is left, its status (`given_back` · `got_back` · `used`). One settled in full is a 409 `credit_closed`. Answers with the credit. Requires payment:create — and settling a `give` credit (money back or used on a bill) gives money back, so it also needs payment:delete (Owner, Admin, Accountant — a 403 `missing_permission` otherwise, D83).",
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
          body: SettlePendingCreditDto,
        },
      },
      controller.transition('settle'),
    );
  };
}
