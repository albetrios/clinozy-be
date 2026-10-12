import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import {
  invoice_items,
  invoices,
} from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import {
  PATIENT_OFFERING_SUGGESTION_HELD_STATUS_VALUES,
  PATIENT_OFFERING_SUGGESTION_STATUS,
  PATIENT_OFFERING_SUGGESTION_TOTAL_STATUS_VALUES,
} from './patient-offering-suggestions.constants.js';
import { patient_offering_suggestions } from './patient-offering-suggestions.schema.js';

/** PK7: how much of a plan row live invoices' lines invoiced — a deleted invoice's lines do not count (B14). */
const INVOICED_QUANTITY = sql`coalesce((select sum(${invoice_items.quantity}) from ${invoice_items} join ${invoices} on ${invoices.id} = ${invoice_items.invoice_id} where ${invoice_items.patient_offering_suggestion_id} = ${patient_offering_suggestions.id} and ${invoices.deleted_at} is null), 0)`;

/** A row still open to invoicing — not yet invoiced in full (PK7). */
const NOT_FULLY_INVOICED = sql`${INVOICED_QUANTITY} < ${patient_offering_suggestions.quantity}`;

/** Where a plan row came from, as its label reads it (PK8). */
export interface PatientOfferingSuggestionSources {
  /** A check-in's date, by its public id. */
  checkInDates: Map<string, string>;
  /** A visit's number and service, by its public id. */
  visits: Map<string, { appointment_number: number; service_label: string }>;
}

/**
 * Persistence for `app.patient_offering_suggestions` (launch ROUTE #135, routes-final 7.M) — the
 * shared app record reads and writes on its table, plus the plan's duplicate check, its total and
 * the sources its labels read.
 *
 * @remarks
 * - **Algorithm:** sorts `created_at` (newest first). The duplicate check reads the
 *   `(patient_id, offering_id)` partial index (PK9); the total sums the planned and accepted rows'
 *   price — or the offering's billed price (its offer price, else its price) × quantity.
 */
export class PatientOfferingSuggestionsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_offering_suggestions,
      entity: 'patientOfferingSuggestion',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /** PK9: whether another live row holds the offering in the patient's plan (an accepted one only until invoiced in full). */
  async hasHeldRow(options: {
    patientId: number;
    offeringId: number;
    exceptId?: number;
  }): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: patient_offering_suggestions.id })
      .from(patient_offering_suggestions)
      .where(
        and(
          eq(patient_offering_suggestions.patient_id, options.patientId),
          eq(patient_offering_suggestions.offering_id, options.offeringId),
          inArray(patient_offering_suggestions.status, [
            ...PATIENT_OFFERING_SUGGESTION_HELD_STATUS_VALUES,
          ]),
          // An accepted row invoiced in full no longer holds the offering (PK9)
          sql`(${patient_offering_suggestions.status} <> ${PATIENT_OFFERING_SUGGESTION_STATUS.ACCEPTED} or ${NOT_FULLY_INVOICED})`,
          isNull(patient_offering_suggestions.deleted_at),
          options.exceptId === undefined
            ? undefined
            : ne(patient_offering_suggestions.id, options.exceptId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** PK9: the plan's total — its live planned and accepted rows (rupees). */
  async planTotal(patientId: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({
        total: sql<string>`coalesce(sum(coalesce(${patient_offering_suggestions.price}, coalesce(${offerings.offer_price}, ${offerings.price}) * ${patient_offering_suggestions.quantity})), 0)`,
      })
      .from(patient_offering_suggestions)
      .innerJoin(offerings, eq(offerings.id, patient_offering_suggestions.offering_id))
      .where(
        and(
          eq(patient_offering_suggestions.patient_id, patientId),
          inArray(patient_offering_suggestions.status, [
            ...PATIENT_OFFERING_SUGGESTION_TOTAL_STATUS_VALUES,
          ]),
          isNull(patient_offering_suggestions.deleted_at),
        ),
      );
    return toAmount(rows[0]?.total) ?? 0;
  }

  /** The check-ins' dates and the visits' numbers and services a page's labels name (PK8). */
  async findSources(options: {
    checkInPublicIds: readonly string[];
    appointmentPublicIds: readonly string[];
  }): Promise<PatientOfferingSuggestionSources> {
    const database = getRequestDatabase();
    const checkIns =
      options.checkInPublicIds.length === 0
        ? []
        : await database
            .select({
              public_id: patient_check_ins.public_id,
              check_in_date: patient_check_ins.check_in_date,
            })
            .from(patient_check_ins)
            .where(inArray(patient_check_ins.public_id, [...options.checkInPublicIds]));
    const visits =
      options.appointmentPublicIds.length === 0
        ? []
        : await database
            .select({
              public_id: appointments.public_id,
              appointment_number: appointments.appointment_number,
              service_label: appointments.service_label,
            })
            .from(appointments)
            .where(inArray(appointments.public_id, [...options.appointmentPublicIds]));
    return {
      checkInDates: new Map(checkIns.map((row) => [row.public_id, row.check_in_date])),
      visits: new Map(visits.map(({ public_id, ...visit }) => [public_id, visit])),
    };
  }

  /**
   * PK7, B13: the plan row an invoice line for this offering invoices when it names none — the
   * patient's oldest live planned or accepted row for it not yet invoiced in full.
   */
  async findOpenRow(options: { patientId: number; offeringId: number }): Promise<number | null> {
    const rows = await getRequestDatabase()
      .select({ id: patient_offering_suggestions.id })
      .from(patient_offering_suggestions)
      .where(
        and(
          eq(patient_offering_suggestions.patient_id, options.patientId),
          eq(patient_offering_suggestions.offering_id, options.offeringId),
          inArray(patient_offering_suggestions.status, [
            ...PATIENT_OFFERING_SUGGESTION_TOTAL_STATUS_VALUES,
          ]),
          isNull(patient_offering_suggestions.deleted_at),
          NOT_FULLY_INVOICED,
        ),
      )
      .orderBy(patient_offering_suggestions.id)
      .limit(1);
    return rows[0]?.id ?? null;
  }
}
