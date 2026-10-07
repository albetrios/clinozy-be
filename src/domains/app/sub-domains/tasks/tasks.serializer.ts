import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { TaskOutput } from './tasks.types.js';

/** Shapes a `app.tasks` row as the API returns it (public ids, numbers, ISO times). */
export function serializeTask(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): TaskOutput {
  return {
    id: row.public_id,
    kind: row.kind as string,
    rule_key: row.rule_key as string | null,
    title: row.title as string,
    why: row.why as string | null,
    owner_membership_id: references.publicIdOf('owner_membership_id', row),
    owner_role: row.owner_role as string,
    patient_id: references.publicIdOf('patient_id', row),
    lead_id: references.publicIdOf('lead_id', row),
    source_type: row.source_type as string | null,
    source_id: row.source_id as string | null,
    due_at: toInstant(row.due_at) as string,
    status: row.status as string,
    snoozed_until: toInstant(row.snoozed_until),
    snooze_label: row.snooze_label as string | null,
    outcome: row.outcome as string | null,
    resolved_at: toInstant(row.resolved_at),
    is_resolved_automatically: row.is_resolved_automatically as boolean,
    result_text: row.result_text as string | null,
    note: row.note as string | null,
    priority: row.priority as string,
    should_remind_before: row.should_remind_before as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
