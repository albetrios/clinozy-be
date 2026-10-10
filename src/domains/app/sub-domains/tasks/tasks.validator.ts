import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds, withInstants } from '@/shared/utils/validation/record-fields.util.js';
import { TASK_STATUS, TASK_TAB } from './tasks.constants.js';
import {
  CreateTaskDto,
  type CreateTaskInput,
  listTasksQueryDto,
  SnoozeTaskDto,
  UpdateTaskDto,
  type UpdateTaskInput,
} from './tasks.dto.js';
import type { TaskTypeFilter } from './tasks.types.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** D81 T6: `rule_key` and `kind` as one type filter — undefined when neither is sent. */
function readTypeFilter(query: {
  rule_key?: string | undefined;
  kind?: string | undefined;
}): TaskTypeFilter | undefined {
  if (query.rule_key === undefined && query.kind === undefined) return undefined;
  return { ruleKeys: query.rule_key?.split(',') ?? [], kinds: query.kind?.split(',') ?? [] };
}

/** Parses a task made by hand; throws `ValidationError` naming each bad field. */
export function validateCreateTask(data: unknown): CreateTaskInput {
  return withInstants(parseWithSchema(CreateTaskDto, data), ['due_at']);
}

/** Parses a change to a task made by hand; throws `ValidationError` naming each bad field. */
export function validateUpdateTask(data: unknown): UpdateTaskInput {
  return withInstants(parseWithSchema(UpdateTaskDto, data), ['due_at']);
}

/** Parses a snooze (10.A.8 #6) into the values it writes. */
export function validateSnoozeTask(data: unknown): Record<string, unknown> {
  const body = parseWithSchema(SnoozeTaskDto, data ?? {});
  return {
    snoozed_until: new Date(body.snoozed_until),
    snooze_label: body.snooze_label ?? null,
  };
}

/**
 * Parses the Tasks tabs' query into a list input (10.A.8 #1) — the tab is a status (the done tab
 * resolved today unless a range is sent); `rule_key` and `kind` are one type filter, a task of any
 * rule or kind named (D81 T6); `scope` is the service's (it knows the caller); a rule that is off
 * hides its tasks (10.10).
 */
export function validateListTasksQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listTasksQueryDto, data);
  const tab = query.tab ?? TASK_TAB.OPEN;
  const doneToday =
    tab === TASK_TAB.DONE && query.resolved_from === undefined && query.resolved_to === undefined;
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    equals: {
      status: tab === TASK_TAB.DONE ? TASK_STATUS.DONE : tab,
      owner_role: query.owner_role,
    },
    referenceEquals: {
      owner_membership_id: query.owner_membership_id,
      contact_id: query.contact_id,
      lead_id: query.lead_id,
      appointment_id: query.appointment_id,
    },
    branchPublicIds: query.branch_id === undefined ? undefined : splitRecordIds(query.branch_id),
    derived: {
      search: query.q,
      type: readTypeFilter(query),
      rules_on: true,
      resolved_today: doneToday ? true : undefined,
    },
    ranges: {
      due_at: { from: readInstant(query.due_from), to: readInstant(query.due_to) },
      resolved_at: { from: readInstant(query.resolved_from), to: readInstant(query.resolved_to) },
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
