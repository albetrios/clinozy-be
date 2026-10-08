import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { offering_suggestions } from '@/domains/app/sub-domains/offering-suggestions/offering-suggestions.schema.js';
import { patient_feedback_actions } from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.schema.js';
import {
  PATIENT_CHECK_IN_ACTION_SCORE_MAX,
  PATIENT_CHECK_IN_FEEL,
} from './patient-check-ins.constants.js';
import { patient_check_ins } from './patient-check-ins.schema.js';

/** A check-in needs a call (TR9): feel `worse` or a low score. */
const isFlagged = sql`(${patient_check_ins.feel} = ${PATIENT_CHECK_IN_FEEL.WORSE} or ${patient_check_ins.score} <= ${PATIENT_CHECK_IN_ACTION_SCORE_MAX})`;

/** A check-in has a feedback action (TR12). */
const hasAction = sql`exists (select 1 from ${patient_feedback_actions} where ${patient_feedback_actions.patient_check_in_id} = ${patient_check_ins.id})`;

/** The plan statuses that already hold an offering for the patient — a check-in skips them (TR10). */
const HELD_SUGGESTION_STATUSES = ['planned', 'next_time', 'accepted'];

/** What the plan names a check-in's next offerings after (TR10). */
const CHECK_IN_SOURCE_LABEL = 'Check-in';

/** A check-in's summary, as a session's latest one (7.H.6). */
export interface PatientCheckInSummaryRow {
  id: string;
  feel: string;
  score: number;
  check_in_date: string;
}

/**
 * Persistence for `app.patient_check_ins` (launch ROUTE #134, routes-final 7.I) — the shared app
 * record reads and writes on its table, plus the reads a page adds: the previous score, the plan's
 * next offerings, a session's latest check-in.
 *
 * @remarks
 * - **Algorithm:** sorts `check_in_date` (newest first) and `created_at`; the derived
 *   `needs_action` filter — feel `worse` or a score ≤ 4 with no feedback action (TR9).
 */
export class PatientCheckInsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_check_ins,
      entity: 'patientCheckIn',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', check_in_date: 'text' },
      derivedFilters: {
        needs_action: (value) =>
          value === true
            ? sql`(${isFlagged} and not ${hasAction})`
            : sql`not (${isFlagged} and not ${hasAction})`,
      },
      defaultSort: 'check_in_date',
      defaultOrder: 'desc',
    });
  }

  /**
   * Each check-in's previous score — the patient's live check-in before it (TR9's trend): `lag()`
   * over the patients' live check-ins by date, then id.
   */
  async findPreviousScores(checkInIds: readonly number[]): Promise<Map<number, number>> {
    if (checkInIds.length === 0) return new Map();
    const database = getRequestDatabase();
    const patientsOfCheckIns = database
      .select({ patient_id: patient_check_ins.patient_id })
      .from(patient_check_ins)
      .where(inArray(patient_check_ins.id, [...checkInIds]));
    const ranked = database
      .select({
        id: patient_check_ins.id,
        previous: sql<
          number | null
        >`lag(${patient_check_ins.score}) over (partition by ${patient_check_ins.patient_id} order by ${patient_check_ins.check_in_date}, ${patient_check_ins.id})`.as(
          'previous',
        ),
      })
      .from(patient_check_ins)
      .where(
        and(
          inArray(patient_check_ins.patient_id, patientsOfCheckIns),
          isNull(patient_check_ins.deleted_at),
        ),
      )
      .as('ranked');
    const rows = await database
      .select({ id: ranked.id, previous: ranked.previous })
      .from(ranked)
      .where(inArray(ranked.id, [...checkInIds]));
    return new Map(
      rows.flatMap((row) => (row.previous === null ? [] : [[row.id, Number(row.previous)]])),
    );
  }

  /** The offerings each check-in planned — its live plan rows (TR10), by check-in id. */
  async findNextOfferingIds(checkInIds: readonly number[]): Promise<Map<number, string[]>> {
    if (checkInIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        check_in_id: offering_suggestions.patient_check_in_id,
        offering_id: offerings.public_id,
      })
      .from(offering_suggestions)
      .innerJoin(offerings, eq(offerings.id, offering_suggestions.offering_id))
      .where(
        and(
          inArray(offering_suggestions.patient_check_in_id, [...checkInIds]),
          isNull(offering_suggestions.deleted_at),
        ),
      )
      .orderBy(offering_suggestions.id);
    const planned = new Map<number, string[]>();
    for (const row of rows) {
      const checkInId = row.check_in_id as number;
      planned.set(checkInId, [...(planned.get(checkInId) ?? []), row.offering_id]);
    }
    return planned;
  }

  /**
   * TR10: plans a check-in's next offerings — one `planned` suggestion each, linked by
   * `patient_check_in_id`, without a `reason`; an offering the patient's plan already holds
   * (planned, next time or accepted) is skipped, not duplicated.
   */
  async planNextOfferings(options: {
    organizationId: number;
    patientId: number;
    checkInId: number;
    appointmentId: number | null;
    offeringIds: readonly number[];
    userId: number | null;
  }): Promise<void> {
    if (options.offeringIds.length === 0) return;
    const database = getRequestDatabase();
    const held = await database
      .select({ offering_id: offering_suggestions.offering_id })
      .from(offering_suggestions)
      .where(
        and(
          eq(offering_suggestions.patient_id, options.patientId),
          inArray(offering_suggestions.offering_id, [...options.offeringIds]),
          inArray(offering_suggestions.status, HELD_SUGGESTION_STATUSES),
          isNull(offering_suggestions.deleted_at),
        ),
      );
    const skip = new Set(held.map((row) => row.offering_id));
    const rows = options.offeringIds
      .filter((offeringId) => !skip.has(offeringId))
      .map((offeringId) => ({
        public_id: generatePublicId('offeringSuggestion'),
        organization_id: options.organizationId,
        patient_id: options.patientId,
        offering_id: offeringId,
        status: 'planned',
        source_label: CHECK_IN_SOURCE_LABEL,
        appointment_id: options.appointmentId,
        patient_check_in_id: options.checkInId,
        created_by_user_id: options.userId,
        updated_by_user_id: options.userId,
      }));
    if (rows.length > 0) await database.insert(offering_suggestions).values(rows);
  }

  /** Each session's latest live check-in (the treatment tab's Feedback column, 7.H.6). */
  async findLatestForTreatments(
    treatmentIds: readonly number[],
  ): Promise<Map<number, PatientCheckInSummaryRow>> {
    if (treatmentIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .selectDistinctOn([patient_check_ins.patient_treatment_id], {
        treatment_id: patient_check_ins.patient_treatment_id,
        id: patient_check_ins.public_id,
        feel: patient_check_ins.feel,
        score: patient_check_ins.score,
        check_in_date: patient_check_ins.check_in_date,
      })
      .from(patient_check_ins)
      .where(
        and(
          inArray(patient_check_ins.patient_treatment_id, [...treatmentIds]),
          isNull(patient_check_ins.deleted_at),
        ),
      )
      .orderBy(
        patient_check_ins.patient_treatment_id,
        desc(patient_check_ins.check_in_date),
        desc(patient_check_ins.id),
      );
    return new Map(rows.map(({ treatment_id, ...summary }) => [treatment_id as number, summary]));
  }
}
