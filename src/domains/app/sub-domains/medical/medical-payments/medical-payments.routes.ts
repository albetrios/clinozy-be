import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PaymentsService } from '@/domains/app/sub-domains/billing/payments/payments.service.js';
import type { PendingCreditsService } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.service.js';
import {
  createMedicalPaymentsController,
  createMedicalPendingCreditsController,
} from './medical-payments.controller.js';
import {
  listMedicalPaymentsQueryDto,
  listMedicalPendingCreditsQueryDto,
} from './medical-payments.dto.js';

/** What the list and its CSV say about the store's slice and the query. */
const STORE_SLICE_TEXT =
  "the payments ledger limited to the medical store — receipts and refunds on `medical` invoices (store credit included), supplier bills of medical orders and `medicines` expenses (and their reversals) — with the ledger's filters (`q`, `direction`, `kind`, `mode`, `branch_id`, the paid days, `is_settled`, …) and sorts. Recording, changing, deleting, restoring and reversing one are the ledger's own routes (`/payments…`) with their codes. Another branch's payments only with branch:read.";

/**
 * Registers the `medical-payments` routes (prefix `/api/v1/app`) — routes-final 11.I, routes 51,
 * 53 and 56: the store's slice of the payments ledger, its CSV, and its customer credits.
 */
export function medicalPaymentsRoutes(services: {
  paymentsService: PaymentsService;
  pendingCreditsService: PendingCreditsService;
}): FastifyPluginAsync {
  const paymentsController = createMedicalPaymentsController(services.paymentsService);
  const pendingCreditsController = createMedicalPendingCreditsController(
    services.pendingCreditsService,
  );

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/medical-payments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List the medical store's payments",
          description: `The store's Payments tab: ${STORE_SLICE_TEXT} Requires medicine:read.`,
          tags: ['Medical store'],
          querystring: listMedicalPaymentsQueryDto,
        },
      },
      paymentsController.list,
    );
    zodApplication.get(
      '/medical-payments/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "Export the medical store's payments",
          description: `Returns the store's payments the same filters and sort as its Payments tab would, as a CSV (\`medical-payments-YYYY-MM-DD.csv\`, up to 5,000 rows; \`is_truncated\` when there are more) — ${STORE_SLICE_TEXT} Requires medicine:export and medicine:read.`,
          tags: ['Medical store'],
          querystring: listMedicalPaymentsQueryDto,
        },
      },
      paymentsController.export,
    );
    zodApplication.get(
      '/medical-pending-credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List the medical store's customer credits",
          description:
            "The Credits tab's customer side: one page of the pending credits that are the store's — naming a `medical` invoice (one of a customer's sales), or left by a return kept as store credit — each as the pending-credit list answers it (`contact`, `direction`, `amount`, `settled_amount`, `left_amount`, `status`, `payment_ids`, …), with its filters (`q`, `direction`, `status`, `contact_id`, `invoice_id`, the settle-by and created ranges) and sorts. Adding, giving back, getting back, using one on a bill, changing or deleting it are the pending credits' own routes (`/pending-credits…`) with their codes. Requires medicine:read.",
          tags: ['Medical store'],
          querystring: listMedicalPendingCreditsQueryDto,
        },
      },
      pendingCreditsController.list,
    );
  };
}
