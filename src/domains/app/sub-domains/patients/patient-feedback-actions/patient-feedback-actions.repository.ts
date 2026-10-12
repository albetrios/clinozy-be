import { desc, eq, inArray } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { patient_feedback_actions } from './patient-feedback-actions.schema.js';

/** A feedback action as its parent reads it — the author's public id joined in. */
export interface PatientFeedbackActionRow {
  public_id: string;
  action: string;
  note: string | null;
  author_membership_id: string | null;
  created_at: Date;
  patient_check_in_id: number | null;
  patient_review_id: number | null;
}

/** The parent an action belongs to — one check-in or one review (TR12). */
export type PatientFeedbackActionParent =
  | { patient_check_in_id: number }
  | { patient_review_id: number };

/**
 * Persistence for `app.patient_feedback_actions` (launch ROUTE #134, routes-final 7.K) — append-only:
 * log one under its check-in or review, read them for a page of parents, newest first.
 *
 * @remarks
 * - **Notes:** never changed or deleted (TR12); an action goes with its parent (`ON DELETE CASCADE`).
 */
export class PatientFeedbackActionsRepository {
  /** Logs an action under its check-in or review (the caller's membership as the author). */
  async insert(options: {
    organizationId: number;
    parent: PatientFeedbackActionParent;
    action: string;
    note: string | null;
    authorMembershipId: number | null;
    userId: number | null;
  }): Promise<void> {
    await getRequestDatabase()
      .insert(patient_feedback_actions)
      .values({
        public_id: generatePublicId('patientFeedbackAction'),
        organization_id: options.organizationId,
        ...options.parent,
        action: options.action,
        note: options.note,
        author_membership_id: options.authorMembershipId,
        created_by_user_id: options.userId,
      });
  }

  /** The actions of a page of check-ins or reviews, newest first. */
  async listForParents(options: {
    column: 'patient_check_in_id' | 'patient_review_id';
    parentIds: readonly number[];
  }): Promise<PatientFeedbackActionRow[]> {
    if (options.parentIds.length === 0) return [];
    const parentColumn = patient_feedback_actions[options.column];
    return getRequestDatabase()
      .select({
        public_id: patient_feedback_actions.public_id,
        action: patient_feedback_actions.action,
        note: patient_feedback_actions.note,
        author_membership_id: memberships.public_id,
        created_at: patient_feedback_actions.created_at,
        patient_check_in_id: patient_feedback_actions.patient_check_in_id,
        patient_review_id: patient_feedback_actions.patient_review_id,
      })
      .from(patient_feedback_actions)
      .leftJoin(memberships, eq(memberships.id, patient_feedback_actions.author_membership_id))
      .where(inArray(parentColumn, [...options.parentIds]))
      .orderBy(desc(patient_feedback_actions.created_at), desc(patient_feedback_actions.id));
  }
}
