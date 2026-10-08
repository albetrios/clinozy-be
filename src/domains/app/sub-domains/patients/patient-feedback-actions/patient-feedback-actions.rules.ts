import {
  findMembershipIdOfUser,
  type BaseRecordRow,
} from '@/domains/app/base-record.repository.js';
import type { BaseRecordActionInput } from '@/domains/app/base-record.types.js';
import { PatientFeedbackActionsRepository } from './patient-feedback-actions.repository.js';
import { serializePatientFeedbackAction } from './patient-feedback-actions.serializer.js';
import { validateLogPatientFeedbackAction } from './patient-feedback-actions.validator.js';

const feedbackActionsRepository = new PatientFeedbackActionsRepository();

/** The column naming an action's parent — a check-in's or a review's. */
export type PatientFeedbackParentColumn = 'patient_check_in_id' | 'patient_review_id';

/**
 * The `actions` record action of a check-in or a review (routes-final 7.K, TR12): logs what was
 * done under it — the caller's membership as the author (none for an API key) — and answers the
 * parent, its `actions` now leading with the new one.
 */
export function createLogFeedbackAction(
  column: PatientFeedbackParentColumn,
): (input: BaseRecordActionInput) => Promise<BaseRecordRow> {
  return async ({ existing, input, context }) => {
    const body = validateLogPatientFeedbackAction(input);
    await feedbackActionsRepository.insert({
      organizationId: context.organizationId,
      parent:
        column === 'patient_check_in_id'
          ? { patient_check_in_id: existing.id }
          : { patient_review_id: existing.id },
      action: body.action,
      note: body.note ?? null,
      authorMembershipId: await findMembershipIdOfUser({
        organizationId: context.organizationId,
        userId: context.userId,
      }),
      userId: context.userId,
    });
    return existing;
  };
}

/**
 * Adds each parent's `actions` (newest first) and `needs_action` to a page (TR9, TR11, TR12) — the
 * first action clears it; `isFlagged` says whether a parent needs one at all.
 */
export async function attachFeedbackActions(options: {
  outputs: Record<string, unknown>[];
  column: PatientFeedbackParentColumn;
  idsByPublicId: ReadonlyMap<string, number>;
  isFlagged: (output: Record<string, unknown>) => boolean;
}): Promise<void> {
  const rows = await feedbackActionsRepository.listForParents({
    column: options.column,
    parentIds: [...options.idsByPublicId.values()],
  });
  for (const output of options.outputs) {
    const parentId = options.idsByPublicId.get(String(output.id));
    const actions = rows
      .filter((row) => row[options.column] === parentId)
      .map(serializePatientFeedbackAction);
    output.actions = actions;
    output.needs_action = options.isFlagged(output) && actions.length === 0;
  }
}
