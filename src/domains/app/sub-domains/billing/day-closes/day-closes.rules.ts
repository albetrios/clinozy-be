import { findMembershipIdOfUser, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import {
  addDaysToCalendarDate,
  rupees,
  toAmount,
  toInstant,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  DAY_CLOSE_BACKDATE_DAYS_MAX,
  DAY_CLOSE_EVENT_KIND,
  DAY_CLOSE_KIND,
  DAY_CLOSE_OPENING_SOURCE,
  DAY_CLOSE_STATUS,
} from './day-closes.constants.js';
import {
  type DayCloseFigures,
  type DayClosesRepository,
  EMPTY_DAY_CLOSE_FIGURES,
} from './day-closes.repository.js';
import { day_closes } from './day-closes.schema.js';

/** What a step writes to the day's events after its row (B27). */
interface PendingDayEvent {
  kind: string;
  text: string | null;
}

/** The events in flight, by their write context — set by `prepare*`, read by `afterWrite`. */
const pendingEvents = new WeakMap<BaseRecordWriteContext, PendingDayEvent[]>();

/** Paise for exact sums. */
function paiseOf(value: number): number {
  return Math.round(value * 100);
}

/** B25: the expected cash — the opening, plus the cash received, less the cash paid that day. */
export function expectedCashOf({
  openingCash,
  figures,
}: {
  openingCash: number;
  figures: DayCloseFigures;
}): number {
  return (paiseOf(openingCash) + paiseOf(figures.cash_in) - paiseOf(figures.cash_out)) / 100;
}

/** The caller's membership (null for an API key or the worker). */
function membershipOf(context: BaseRecordWriteContext): Promise<number | null> {
  return findMembershipIdOfUser({ organizationId: context.organizationId, userId: context.userId });
}

/** B25: opens a day — its date (today, up to 120 days back), the carried or recounted opening, who accepted it. */
async function prepareDayOpen(options: {
  repository: DayClosesRepository;
  values: Record<string, unknown>;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, values, context } = options;
  const today = await organizationToday(context);
  values.close_date ??= today;
  const date = String(values.close_date);
  if (
    date > today ||
    date < addDaysToCalendarDate({ date: today, days: -DAY_CLOSE_BACKDATE_DAYS_MAX })
  ) {
    throw fieldValidationError({
      field: 'close_date',
      messageKey: 'errors:validation.dayCloseDateOutOfRange',
      messageParams: { days: DAY_CLOSE_BACKDATE_DAYS_MAX },
    });
  }
  const carried =
    (await repository.findLastCountedCash({
      branchId: values.branch_id as number,
      before: date,
    })) ?? 0;
  values.opening_source ??= DAY_CLOSE_OPENING_SOURCE.CARRIED;
  const recounted = values.opening_source === DAY_CLOSE_OPENING_SOURCE.RECOUNTED;
  if (!recounted) values.opening_cash = carried;
  values.status = DAY_CLOSE_STATUS.OPEN;
  values.opening_accepted_by_membership_id = await membershipOf(context);
  const events: PendingDayEvent[] = [
    {
      kind: DAY_CLOSE_EVENT_KIND.OPENED,
      text: `Opening cash ${rupees(Number(values.opening_cash))}`,
    },
  ];
  if (recounted) {
    events.push({
      kind: DAY_CLOSE_EVENT_KIND.RECOUNTED,
      text: `Recounted ${rupees(Number(values.opening_cash))} (carried ${rupees(carried)})`,
    });
  }
  pendingEvents.set(context, events);
}

/** B25: reopens a closed day — the count cleared, the reason kept on its event. */
function prepareDayReopen({
  values,
  context,
}: {
  values: Record<string, unknown>;
  context: BaseRecordWriteContext;
}): void {
  pendingEvents.set(context, [
    { kind: DAY_CLOSE_EVENT_KIND.REOPENED, text: String(values.reason) },
  ]);
  delete values.reason;
  Object.assign(values, {
    expected_cash: null,
    counted_cash: null,
    difference_reason: null,
    close_kind: null,
    closed_at: null,
    closed_by_membership_id: null,
  });
}

/** B25, B6: closes a day — takes it `FOR UPDATE`, stores the expected cash, wants a reason for a difference. */
async function prepareDayClose(options: {
  repository: DayClosesRepository;
  values: Record<string, unknown>;
  existing: BaseRecordRow;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, values, existing, context } = options;
  await repository.lockForClose(existing.id);
  const figures =
    (await repository.findFigures([existing.id], context.organizationId)).get(existing.id) ??
    EMPTY_DAY_CLOSE_FIGURES;
  const expected = expectedCashOf({ openingCash: toAmount(existing.opening_cash) ?? 0, figures });
  const counted = Number(values.counted_cash);
  if (paiseOf(counted) === paiseOf(expected)) {
    values.difference_reason = null;
  } else if (typeof values.difference_reason !== 'string') {
    throw fieldValidationError({
      field: 'difference_reason',
      messageKey: 'errors:validation.dayCloseDifferenceReasonRequired',
    });
  }
  Object.assign(values, {
    expected_cash: expected,
    close_kind: DAY_CLOSE_KIND.MANUAL,
    closed_by_membership_id: await membershipOf(context),
  });
  pendingEvents.set(context, [
    {
      kind: DAY_CLOSE_EVENT_KIND.CLOSED,
      text: `Counted ${rupees(counted)}, expected ${rupees(expected)}`,
    },
  ]);
}

/**
 * The day-close rules (launch ROUTE #136, routes-final 8.E): opening a branch's day, counting and
 * closing it, reopening it, what happened, and the live figures a page reads.
 *
 * @remarks
 * - **Algorithm:** opening defaults to the organization's today (never in the future, up to 120
 *   days back) and to the last close's counted cash (`carried`, 0 for the first) unless recounted
 *   (B25). Closing takes the day `FOR UPDATE` (B6), stores the expected cash — the opening plus
 *   the cash received less the cash paid in the day's live payments — and wants a reason when the
 *   count differs. Reopening clears the close (the next close recomputes). Each step writes its
 *   event (B27); a page reads the live figures, the totals per member and the events.
 * - **Failure modes:** `ValidationError` on `close_date`, `difference_reason`.
 */
export function createDayClosesRules(repository: DayClosesRepository): BaseRecordRules {
  return {
    prepareCreate: (values, context) => prepareDayOpen({ repository, values, context }),
    prepareTransition: (action, values, existing, context) =>
      action === 'reopen'
        ? prepareDayReopen({ values, context })
        : prepareDayClose({ repository, values, existing, context }),
    afterWrite: async (row, _change, context) => {
      const events = pendingEvents.get(context);
      pendingEvents.delete(context);
      const membershipId = events ? await membershipOf(context) : null;
      for (const event of events ?? []) {
        await repository.insertEvent({
          organizationId: context.organizationId,
          dayCloseId: row.id,
          kind: event.kind,
          text: event.text,
          membershipId,
          userId: context.userId,
        });
      }
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: day_closes,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const ids = [...idsByPublicId.values()];
      const figures = await repository.findFigures(ids, context.organizationId);
      const members = await repository.findMemberTotals(ids, context.organizationId);
      const events = await repository.findEvents(ids);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        if (id === undefined) continue;
        const day = figures.get(id) ?? EMPTY_DAY_CLOSE_FIGURES;
        output.cash_in = day.cash_in;
        output.cash_out = day.cash_out;
        output.net_by_mode = day.net;
        output.entry_count = day.entry_count;
        output.by_member = members.get(id) ?? [];
        if (output.status === DAY_CLOSE_STATUS.OPEN) {
          output.expected_cash = expectedCashOf({
            openingCash: Number(output.opening_cash),
            figures: day,
          });
        }
        output.events = (events.get(id) ?? []).map((event) => ({
          id: event.id,
          kind: event.kind,
          text: event.text,
          membership_id: event.membership_id,
          occurred_at: toInstant(event.occurred_at),
        }));
      }
    },
  };
}
