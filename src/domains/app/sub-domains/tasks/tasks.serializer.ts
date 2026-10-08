import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import { TASK_AUTOMATIC_RULE_VALUES } from './tasks.constants.js';
import type { TaskOutput } from './tasks.types.js';

/**
 * Shapes an `app.tasks` row as the API returns it (routes-final 10.A.6). The person's summary and
 * the owner changes are the rules' `decorate`.
 */
export function serializeTask(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): TaskOutput {
  const contactId = references.publicIdOf('contact_id', row);
  return {
    id: row.public_id,
    kind: row.kind as string,
    rule_key: (row.rule_key as string | null) ?? null,
    title: row.title as string,
    why: (row.why as string | null) ?? null,
    owner_membership_id: references.publicIdOf('owner_membership_id', row),
    owner_role: (row.owner_role as string | null) ?? null,
    contact:
      contactId === null
        ? null
        : { id: contactId, name: '', primary_phone: null, preference_tags: [] },
    lead_id: references.publicIdOf('lead_id', row),
    appointment_id: references.publicIdOf('appointment_id', row),
    patient_treatment_id: references.publicIdOf('patient_treatment_id', row),
    patient_check_in_id: references.publicIdOf('patient_check_in_id', row),
    patient_review_id: references.publicIdOf('patient_review_id', row),
    invoice_id: references.publicIdOf('invoice_id', row),
    pending_credit_id: references.publicIdOf('pending_credit_id', row),
    medical_rep_id: references.publicIdOf('medical_rep_id', row),
    branch_id: references.publicIdOf('branch_id', row),
    due_at: toInstant(row.due_at) as string,
    status: row.status as string,
    snoozed_until: toInstant(row.snoozed_until),
    snooze_label: (row.snooze_label as string | null) ?? null,
    outcome: (row.outcome as string | null) ?? null,
    result_text: (row.result_text as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    resolved_at: toInstant(row.resolved_at),
    is_resolved_automatically: row.is_resolved_automatically as boolean,
    resolved_by_membership_id: references.publicIdOf('resolved_by_membership_id', row),
    priority: row.priority as string,
    owner_changes: [],
    can_clinozy_handle: (TASK_AUTOMATIC_RULE_VALUES as readonly unknown[]).includes(row.rule_key),
    next_task_id: null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
