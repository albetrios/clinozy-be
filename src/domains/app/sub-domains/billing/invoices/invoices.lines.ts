import { resolveRecordIds, type BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { MedicinesRepository } from '@/domains/app/sub-domains/medical/medicines/medicines.repository.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { OfferingsRepository } from '@/domains/app/sub-domains/offerings/offerings.repository.js';
import { PATIENT_OFFERING_SUGGESTION_STATUS } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.constants.js';
import { patient_offering_suggestions } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.schema.js';
import { PatientOfferingSuggestionsRepository } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.repository.js';
import { PatientOfferingsRepository } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.repository.js';
import { PATIENT_TREATMENT_STATUS } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.constants.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { PatientTreatmentsRepository } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.repository.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { addDaysToCalendarDate, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { computeInvoiceAmounts, type InvoiceLineAmounts } from './invoices.amounts.js';
import { INVOICE_SESSION_CATEGORY_VALUES, INVOICE_TYPE } from './invoices.constants.js';
import type { InvoiceItemInput } from './invoices.dto.js';
import {
  billedPriceOf,
  type InvoiceBilledPrice,
  type InvoiceOfferCandidate,
} from './invoices.pricing.js';
import { type InvoiceItemWriteRow, InvoicesRepository } from './invoices.repository.js';

const medicinesRepository = new MedicinesRepository();
const offeringsRepository = new OfferingsRepository();
const patientOfferingsRepository = new PatientOfferingsRepository();
const suggestionsRepository = new PatientOfferingSuggestionsRepository();
const treatmentsRepository = new PatientTreatmentsRepository();
const invoicesRepository = new InvoicesRepository();

/** The offering category of a consultation invoice's lines (B8). */
const CONSULTATION_CATEGORY = 'consultation';

/**
 * One line as a save plans it — as sent, or as another write sends it: a medical sale names the
 * batch each line draws from (`medicine_batch_id`, MD19), which no API body carries.
 */
export type InvoiceLineInput = InvoiceItemInput & { medicine_batch_id?: number };

/** The header a plan reads: where, what kind, for whom, when, and its overall discount. */
export interface InvoiceLineHeader {
  type: string;
  branchId: number;
  /** The contact's patient file — a session line's patient offering is its (PK4). */
  patientId: number | null;
  invoiceDate: string;
  overallDiscount: number;
}

/** One line as the save writes it (B9, B12, B13, B28). */
export interface PlannedInvoiceLine {
  /** Its place in the save's `items` (0-based) — the line a refusal names (`items/2`). */
  index: number;
  existing: InvoiceItemWriteRow | undefined;
  offering: BaseRecordRow | null;
  /** The columns the line row is written with. */
  values: Record<string, unknown>;
  /** The sessions its patient offering holds, when it sells sessions (PK4); null otherwise. */
  sessionsTotal: number | null;
  /** The patient offering's `valid_until` for a new one (invoice date + validity days, or none). */
  validUntil: string | null;
  /** The treatments it now bills (B28). */
  treatmentIds: number[];
  /**
   * The live offers its rate and sessions apply (M26) — the price offer, then the extra-sessions
   * one; none on a kept line, which keeps its snapshot (B12).
   */
  offerIds: string[];
  amounts: InvoiceLineAmounts;
}

/** A save's lines, the left-out ones, and the invoice's totals (B9). */
export interface InvoiceLinePlan {
  lines: PlannedInvoiceLine[];
  removedIds: number[];
  totals: Record<string, number>;
}

/** A 400 on `items` with its message. */
function itemsError({
  messageKey,
  messageParams,
}: {
  messageKey: string;
  messageParams?: Record<string, string | number> | undefined;
}) {
  return fieldValidationError({
    field: 'items',
    messageKey,
    ...(messageParams ? { messageParams } : {}),
  });
}

/** Whether an offering sells sessions — its line creates a patient offering (PK4). */
function sellsSessions(offering: BaseRecordRow | null): boolean {
  return (
    offering !== null &&
    (INVOICE_SESSION_CATEGORY_VALUES as readonly unknown[]).includes(offering.category)
  );
}

/** The ids of a list of public ids (live rows of the organization) — unknown ones absent. */
async function resolveAll({
  table,
  organizationId,
  publicIds,
}: {
  table: Parameters<typeof resolveRecordIds>[0]['table'];
  organizationId: number;
  publicIds: readonly (string | null | undefined)[];
}): Promise<Map<string, number>> {
  return resolveRecordIds({
    table,
    organizationId,
    publicIds: publicIds.filter((id): id is string => typeof id === 'string'),
  });
}

/** B8, O13, O5: a new or changed offering line fits the invoice — active, offered here, the type's kind. */
async function assertOfferingFits(options: {
  offering: BaseRecordRow;
  header: InvoiceLineHeader;
  offeredBranches: ReadonlyMap<number, number[]>;
}): Promise<void> {
  const { offering, header } = options;
  if (offering.is_active !== true) {
    throw itemsError({
      messageKey: 'errors:validation.offeringNotActive',
      messageParams: { id: String(offering.public_id) },
    });
  }
  const branches = options.offeredBranches.get(offering.id) ?? [];
  if (branches.length > 0 && !branches.includes(header.branchId)) {
    throw itemsError({
      messageKey: 'errors:validation.invoiceOfferingNotAtBranch',
      messageParams: {
        id: String(offering.public_id),
      },
    });
  }
  if (header.type === INVOICE_TYPE.CONSULTATION && offering.category !== CONSULTATION_CATEGORY) {
    throw itemsError({ messageKey: 'errors:validation.invoiceConsultationOnly' });
  }
}

/**
 * The plan row a line invoices (PK7): the one it names — the patient's, for the same offering —
 * or, when it names none, the patient's live planned or accepted row for that offering.
 */
async function resolveSuggestion(options: {
  item: InvoiceItemInput;
  existing: InvoiceItemWriteRow | undefined;
  offeringId: number | null;
  patientId: number | null;
  suggestionIds: ReadonlyMap<string, number>;
}): Promise<number | null> {
  const { item } = options;
  if (item.patient_offering_suggestion_id === null) return null;
  if (item.patient_offering_suggestion_id === undefined) {
    if (options.existing) return options.existing.patient_offering_suggestion_id;
    if (options.offeringId === null || options.patientId === null) return null;
    return suggestionsRepository.findOpenRow({
      patientId: options.patientId,
      offeringId: options.offeringId,
    });
  }
  const id = options.suggestionIds.get(item.patient_offering_suggestion_id);
  const row = id === undefined ? null : await suggestionsRepository.findById(id);
  if (!row || row.patient_id !== options.patientId || row.offering_id !== options.offeringId) {
    throw itemsError({
      messageKey: 'errors:validation.invoiceSuggestionNotThePatients',
      messageParams: {
        id: item.patient_offering_suggestion_id,
      },
    });
  }
  return row.id;
}

/**
 * B28: the treatments a line bills — the patient's, done, of the line's offering, not billed yet,
 * and no more than the sessions it has left; else a 400 on `patient_treatment_ids`.
 */
async function resolveTreatments(options: {
  item: InvoiceItemInput;
  patientId: number | null;
  offeringId: number | null;
  sessionsLeft: number;
  treatmentIds: ReadonlyMap<string, number>;
}): Promise<number[]> {
  const publicIds = options.item.patient_treatment_ids ?? [];
  if (publicIds.length === 0) return [];
  const refuse = () =>
    fieldValidationError({
      field: 'patient_treatment_ids',
      messageKey: 'errors:validation.invoiceTreatmentNotBillable',
    });
  if (publicIds.length > options.sessionsLeft) throw refuse();
  const ids: number[] = [];
  for (const publicId of publicIds) {
    const id = options.treatmentIds.get(publicId);
    const treatment = id === undefined ? null : await treatmentsRepository.findById(id);
    if (
      !treatment ||
      treatment.patient_id !== options.patientId ||
      treatment.offering_id !== options.offeringId ||
      treatment.status !== PATIENT_TREATMENT_STATUS.DONE ||
      treatment.patient_offering_id !== null
    ) {
      throw refuse();
    }
    ids.push(treatment.id);
  }
  return ids;
}

/**
 * What an offering bills on the invoice's day at its branch (M26, routes-final §3.10) — the best
 * live offer on its base price, never below its lowest price ({@link billedPriceOf}).
 */
function billedPriceOfOffering(options: {
  offering: BaseRecordRow;
  header: InvoiceLineHeader;
  offers: ReadonlyMap<number, InvoiceOfferCandidate[]>;
}): InvoiceBilledPrice {
  const { offering } = options;
  return billedPriceOf({
    price: toAmount(offering.price) ?? 0,
    offerPrice: toAmount(offering.offer_price),
    minPrice: toAmount(offering.min_price) ?? 0,
    offers: options.offers.get(offering.id) ?? [],
    day: options.header.invoiceDate,
  });
}

/**
 * The snapshot of a line's item (B9): its name, rate, GST — the offering's billed price (M26), or
 * the medicine's MRP.
 */
function snapshotOf(options: {
  offering: BaseRecordRow | null;
  medicine: BaseRecordRow | null;
  billed: InvoiceBilledPrice | null;
}): Record<string, unknown> {
  const { offering, medicine } = options;
  if (offering) {
    return {
      offering_id: offering.id,
      medicine_id: null,
      name: offering.name,
      pack_size: null,
      rate: options.billed?.rate ?? toAmount(offering.price) ?? 0,
      gst_percent: offering.gst_percent,
      is_gst_inclusive: offering.is_gst_inclusive,
    };
  }
  return {
    offering_id: null,
    medicine_id: medicine?.id,
    name: medicine?.name,
    pack_size: null,
    rate: toAmount(medicine?.mrp) ?? 0,
    gst_percent: medicine?.gst_percent,
    is_gst_inclusive: true,
  };
}

/** The internal ids of what a save's lines name — one read per kind of id. */
interface InvoiceLineIds {
  offerings: Map<string, number>;
  medicines: Map<string, number>;
  suggestions: Map<string, number>;
  treatments: Map<string, number>;
}

/** Resolves the offerings, medicines, plan rows and treatments a save's lines name. */
async function resolveLineIds({
  organizationId,
  items,
}: {
  organizationId: number;
  items: readonly InvoiceItemInput[];
}): Promise<InvoiceLineIds> {
  return {
    offerings: await resolveAll({
      table: offerings,
      organizationId,
      publicIds: items.map((item) => item.offering_id),
    }),
    medicines: await resolveAll({
      table: medicines,
      organizationId,
      publicIds: items.map((item) => item.medicine_id),
    }),
    suggestions: await resolveAll({
      table: patient_offering_suggestions,
      organizationId,
      publicIds: items.map((item) => item.patient_offering_suggestion_id),
    }),
    treatments: await resolveAll({
      table: patient_treatments,
      organizationId,
      publicIds: items.flatMap((item) => item.patient_treatment_ids ?? []),
    }),
  };
}

/** What a line's item is after the save — sent, else kept — and whether the save changes it. */
interface LineItem {
  offeringId: number | null;
  medicineId: number | null;
  changesItem: boolean;
}

/**
 * B8: a line's item — the offering or medicine it sends (live here, a 400 otherwise), else the
 * kept line's — of the kind the invoice's type takes.
 */
function resolveLineItem(options: {
  item: InvoiceItemInput;
  kept: InvoiceItemWriteRow | undefined;
  ids: InvoiceLineIds;
  type: string;
}): LineItem {
  const { item, kept, ids } = options;
  const sentOfferingId =
    item.offering_id === undefined ? undefined : ids.offerings.get(item.offering_id);
  const sentMedicineId =
    item.medicine_id === undefined ? undefined : ids.medicines.get(item.medicine_id);
  if (item.offering_id !== undefined && sentOfferingId === undefined) {
    throw itemsError({
      messageKey: 'errors:validation.offeringNotActive',
      messageParams: { id: item.offering_id },
    });
  }
  if (item.medicine_id !== undefined && sentMedicineId === undefined) {
    throw itemsError({
      messageKey: 'errors:validation.invoiceMedicineNotLive',
      messageParams: { id: item.medicine_id },
    });
  }
  const itemSent = sentOfferingId !== undefined || sentMedicineId !== undefined;
  const offeringId =
    sentOfferingId ?? (sentMedicineId === undefined ? (kept?.offering_id ?? null) : null);
  const medicineId =
    sentMedicineId ?? (sentOfferingId === undefined ? (kept?.medicine_id ?? null) : null);
  const isMedical = options.type === INVOICE_TYPE.MEDICAL;
  if ((offeringId !== null) === isMedical) {
    throw itemsError({
      messageKey: isMedical
        ? 'errors:validation.invoiceMedicalLinesOnly'
        : 'errors:validation.invoiceOfferingLinesOnly',
    });
  }
  return {
    offeringId,
    medicineId,
    changesItem: itemSent && (offeringId !== kept?.offering_id || medicineId !== kept?.medicine_id),
  };
}

/** A kept line's snapshot, unchanged (B12). */
function keptSnapshot(kept: InvoiceItemWriteRow): Record<string, unknown> {
  return {
    offering_id: kept.offering_id,
    medicine_id: kept.medicine_id,
    name: kept.name,
    pack_size: kept.pack_size,
    rate: toAmount(kept.rate) ?? 0,
    gst_percent: kept.gst_percent,
    is_gst_inclusive: kept.is_gst_inclusive,
  };
}

/** What one line's plan needs beyond the line itself. */
interface LinePlanContext {
  header: InvoiceLineHeader;
  ids: InvoiceLineIds;
  offeredBranches: Map<number, number[]>;
  /** The offers that name each offering and run at the invoice's branch (M26). */
  offers: Map<number, InvoiceOfferCandidate[]>;
  readOffering: (id: number) => Promise<BaseRecordRow | null>;
}

/**
 * PK4: the sessions a line sells — a kept line keeps its own per unit (what it was sold with,
 * free sessions included, B12); a new or changed one the offering's sessions plus the best live
 * extra-sessions offer's (M26), per unit. Null for an offering that sells no sessions.
 */
function sessionsOf(options: {
  offering: BaseRecordRow | null;
  kept: InvoiceItemWriteRow | undefined;
  keepsItem: boolean;
  quantity: number;
  extraSessions: number;
}): number | null {
  const { offering, kept } = options;
  if (!sellsSessions(offering)) return null;
  const stored = kept?.sessions_total;
  if (options.keepsItem && kept && typeof stored === 'number' && kept.quantity > 0) {
    return Math.round(stored / kept.quantity) * options.quantity;
  }
  return (Number(offering?.sessions ?? 1) + options.extraSessions) * options.quantity;
}

/**
 * Refuses a line change the invoice cannot take: a new or changed offering that does not fit the
 * invoice (its branch, its patient file), and a line whose sessions were spent being changed (B13).
 */
async function assertLineChangeAllowed(options: {
  item: InvoiceLineInput;
  kept: InvoiceItemWriteRow | undefined;
  offering: Awaited<ReturnType<LinePlanContext['readOffering']>>;
  changesItem: boolean;
  plan: LinePlanContext;
}): Promise<void> {
  const { item, kept, offering, changesItem, plan } = options;
  if (offering && (!kept || changesItem)) {
    await assertOfferingFits({
      offering,
      header: plan.header,
      offeredBranches: plan.offeredBranches,
    });
  }
  const spent = kept?.sessions_used ?? 0;
  if (spent > 0 && (changesItem || item.quantity !== kept?.quantity)) {
    throw new ConflictError('errors:invoiceOfferingInUse').withReason('offering_in_use');
  }
}

/**
 * Plans one line (B8–B13, B28): its item, the fit, the spent-session guard, the snapshot (a new or
 * changed offering line at its billed price — the best live offer, M26), the sessions and validity
 * it sells, the treatments it bills and the plan row it invoices.
 */
async function planLine(options: {
  item: InvoiceLineInput;
  index: number;
  kept: InvoiceItemWriteRow | undefined;
  plan: LinePlanContext;
}): Promise<Omit<PlannedInvoiceLine, 'amounts'>> {
  const { item, kept, plan } = options;
  const { header } = plan;
  const { offeringId, medicineId, changesItem } = resolveLineItem({
    item,
    kept,
    ids: plan.ids,
    type: header.type,
  });
  const offering = offeringId === null ? null : await plan.readOffering(offeringId);
  await assertLineChangeAllowed({ item, kept, offering, changesItem, plan });
  const spent = kept?.sessions_used ?? 0;
  const keepsItem = kept !== undefined && !changesItem;
  const medicine =
    medicineId === null || keepsItem ? null : await medicinesRepository.findById(medicineId);
  const billed =
    offering && !keepsItem
      ? billedPriceOfOffering({ offering, header, offers: plan.offers })
      : null;
  const snapshot = keepsItem ? keptSnapshot(kept) : snapshotOf({ offering, medicine, billed });
  const sessionsTotal = sessionsOf({
    offering,
    kept,
    keepsItem,
    quantity: item.quantity,
    extraSessions: billed?.extraSessions ?? 0,
  });
  const validityDays = Number(offering?.validity_days ?? 0);
  return {
    index: options.index,
    existing: kept,
    offering,
    sessionsTotal,
    validUntil:
      validityDays > 0
        ? addDaysToCalendarDate({ date: header.invoiceDate, days: validityDays })
        : null,
    treatmentIds: await resolveTreatments({
      item,
      patientId: header.patientId,
      offeringId,
      sessionsLeft: sessionsTotal === null ? 0 : sessionsTotal - spent,
      treatmentIds: plan.ids.treatments,
    }),
    offerIds: billed
      ? [billed.priceOfferId, billed.extraOfferId].filter((id): id is string => id !== null)
      : [],
    values: {
      ...snapshot,
      line_number: options.index + 1,
      quantity: item.quantity,
      discount_percent: item.discount_percent ?? toAmount(kept?.discount_percent) ?? 0,
      batch_number:
        item.batch_number === undefined ? (kept?.batch_number ?? null) : item.batch_number,
      ...(item.medicine_batch_id === undefined
        ? {}
        : { medicine_batch_id: item.medicine_batch_id }),
      patient_offering_suggestion_id: await resolveSuggestion({
        item,
        existing: changesItem ? undefined : kept,
        offeringId,
        patientId: header.patientId,
        suggestionIds: plan.ids.suggestions,
      }),
    },
  };
}

/** B9: the planned lines with their amounts, and the invoice's totals — the overall discount at most what the lines come to. */
function withAmounts({
  pending,
  overallDiscount,
}: {
  pending: readonly Omit<PlannedInvoiceLine, 'amounts'>[];
  overallDiscount: number;
}): { lines: PlannedInvoiceLine[]; totals: InvoiceLinePlan['totals'] } {
  const computed = computeInvoiceAmounts({
    lines: pending.map((line) => ({
      quantity: Number(line.values.quantity),
      rate: Number(line.values.rate),
      discountPercent: Number(line.values.discount_percent),
      gstPercent: Number(line.values.gst_percent),
      isGstInclusive: line.values.is_gst_inclusive === true,
    })),
    overallDiscount,
  });
  if (overallDiscount > computed.afterLineDiscounts) {
    throw fieldValidationError({
      field: 'overall_discount',
      messageKey: 'errors:validation.invoiceOverallDiscountTooHigh',
    });
  }
  return {
    lines: pending.map((line, index) => ({ ...line, amounts: computed.lines[index]! })),
    totals: {
      subtotal: computed.subtotal,
      discount_total: computed.discountTotal,
      taxable_total: computed.taxableTotal,
      gst_total: computed.gstTotal,
      total: computed.total,
    },
  };
}

/**
 * Plans an invoice's lines for a save (routes-final 8.A, B8–B13, B28): resolves each line's item,
 * checks it fits the invoice, keeps or takes its snapshot, links its plan row and the treatments
 * it bills, computes every amount, and refuses what the save may not do.
 *
 * @remarks
 * - **Algorithm:** a line sent with an `id` is a kept line (its snapshot stays unless its item
 *   changes), without one a new line; a stored line left out is removed. A new or changed
 *   offering line bills the best live offer on the invoice's day at its branch, never below the
 *   lowest price, and a session line adds the best extra-sessions offer's free sessions (M26,
 *   routes-final §3.10). One read per kind of id; the amounts from {@link computeInvoiceAmounts}.
 * - **Failure modes:** `ValidationError` on `items` (a line of another invoice, the wrong kind for
 *   the type, an inactive offering or one not offered here, another patient's plan row),
 *   `patient_treatment_ids`, `overall_discount` (more than the lines come to), and
 *   `below_lowest_price` (B10, on `items/<n>` — the line); `ConflictError` `offering_in_use` (a
 *   line whose patient offering has a spent session removed, or its offering or quantity changed).
 */
export async function planInvoiceLines(options: {
  context: BaseRecordWriteContext;
  header: InvoiceLineHeader;
  items: readonly InvoiceLineInput[];
  existing: readonly InvoiceItemWriteRow[];
}): Promise<InvoiceLinePlan> {
  const { context, header, items, existing } = options;
  const ids = await resolveLineIds({ organizationId: context.organizationId, items });
  const existingByPublicId = new Map(existing.map((row) => [row.public_id, row]));
  const offeringRows = new Map<number, BaseRecordRow>();
  const plan: LinePlanContext = {
    header,
    ids,
    offeredBranches: await offeringsRepository.findOfferedBranches([...ids.offerings.values()]),
    // Only a sent offering takes a new snapshot — a kept line keeps its rate (B12)
    offers: await invoicesRepository.findOfferCandidates({
      offeringIds: [...ids.offerings.values()],
      branchId: header.branchId,
    }),
    readOffering: async (id) => {
      if (!offeringRows.has(id)) {
        const row = await offeringsRepository.findById(id);
        if (row) offeringRows.set(id, row);
      }
      return offeringRows.get(id) ?? null;
    },
  };
  const keptIds = new Set<number>();
  const pending: Omit<PlannedInvoiceLine, 'amounts'>[] = [];
  for (const [index, item] of items.entries()) {
    const kept = item.id === undefined ? undefined : existingByPublicId.get(item.id);
    if (item.id !== undefined && !kept) {
      throw itemsError({
        messageKey: 'errors:validation.invoiceItemNotOnInvoice',
        messageParams: { id: item.id },
      });
    }
    if (kept) keptIds.add(kept.id);
    pending.push(await planLine({ item, index, kept, plan }));
  }
  const removed = existing.filter((row) => !keptIds.has(row.id));
  if (removed.some((row) => (row.sessions_used ?? 0) > 0)) {
    throw new ConflictError('errors:invoiceOfferingInUse').withReason('offering_in_use');
  }
  const { lines, totals } = withAmounts({ pending, overallDiscount: header.overallDiscount });
  await assertNotBelowLowestPrice({ lines, context });
  return { lines, removedIds: removed.map((row) => row.id), totals };
}

/**
 * B10: no offering line's net per unit — after its discounts, before GST is added — below the
 * offering's lowest price; the 400 names the line (`items/<n>`, its place in the save's `items` —
 * D81, PAY-M1), and the floor only to holders of `offering:lower_price:read`.
 */
async function assertNotBelowLowestPrice({
  lines,
  context,
}: {
  lines: readonly PlannedInvoiceLine[];
  context: BaseRecordWriteContext;
}): Promise<void> {
  for (const line of lines) {
    const floor = toAmount(line.offering?.min_price) ?? 0;
    const quantity = Number(line.values.quantity);
    if (line.offering && Math.round(line.amounts.net * 100) < Math.round(floor * 100) * quantity) {
      const showsFloor = await context.can(APP_PERMISSIONS.OFFERING_LOWER_PRICE_READ);
      throw fieldValidationError({
        field: `items/${line.index}`,
        messageKey: showsFloor
          ? 'errors:validation.invoiceBelowLowestPriceFloor'
          : 'errors:validation.invoiceBelowLowestPrice',
        messageParams: { name: String(line.values.name), ...(showsFloor ? { floor } : {}) },
      }).withReason('below_lowest_price');
    }
  }
}

/** A line's amounts as its row's columns. */
function amountColumns(amounts: InvoiceLineAmounts): Record<string, number> {
  return {
    discount_amount: amounts.discountAmount,
    taxable_amount: amounts.taxableAmount,
    gst_amount: amounts.gstAmount,
    amount: amounts.amount,
  };
}

/**
 * B28, TR13: links each treatment a line bills to its patient offering and spends a session for
 * it — the session's number becomes the offering's count; one billed meanwhile is a 409
 * `treatment_billed`.
 */
async function billTreatments(options: {
  patientOfferingId: number;
  treatmentIds: readonly number[];
  context: BaseRecordWriteContext;
}): Promise<void> {
  for (const treatmentId of options.treatmentIds) {
    const spent = await patientOfferingsRepository.adjust({
      id: options.patientOfferingId,
      column: 'sessions_used',
      delta: 1,
      ceilingColumn: 'sessions_total',
      userId: options.context.userId,
    });
    const linked =
      spent &&
      (await treatmentsRepository.linkToPatientOffering({
        treatmentId,
        patientOfferingId: options.patientOfferingId,
        sessionNumber: Number(spent.sessions_used),
        userId: options.context.userId,
      }));
    if (!linked)
      throw new ConflictError('errors:invoiceTreatmentBilled').withReason('treatment_billed');
  }
}

/**
 * Writes a planned save's lines (B12, B13, PK4, PK7, B28): removes the left-out lines (their
 * unspent patient offerings with them), changes the kept ones and adds the new ones; keeps each
 * session line's patient offering in step; marks the plan rows it invoices accepted; bills the
 * treatments named.
 */
export async function writeInvoiceLines(options: {
  repository: InvoicesRepository;
  invoice: BaseRecordRow;
  plan: InvoiceLinePlan;
  patientId: number | null;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, invoice, plan, context } = options;
  await repository.deleteItems(plan.removedIds);
  for (const line of plan.lines) {
    const values = { ...line.values, ...amountColumns(line.amounts) };
    let itemId: number;
    if (line.existing) {
      itemId = line.existing.id;
      await repository.updateItem({ id: itemId, values, userId: context.userId });
    } else {
      itemId = await repository.insertItem({
        ...values,
        invoice_id: invoice.id,
        organization_id: context.organizationId,
        created_by_user_id: context.userId,
        updated_by_user_id: context.userId,
      });
    }
    const patientOfferingId = await syncPatientOffering({
      line,
      itemId,
      patientId: options.patientId,
      context,
    });
    if (patientOfferingId !== null) {
      await billTreatments({ patientOfferingId, treatmentIds: line.treatmentIds, context });
    }
    if (typeof line.values.patient_offering_suggestion_id === 'number') {
      await suggestionsRepository.update(
        line.values.patient_offering_suggestion_id,
        { status: PATIENT_OFFERING_SUGGESTION_STATUS.ACCEPTED },
        context.userId,
      );
    }
  }
}

/**
 * PK4: a session line's patient offering — created for a new one, kept in step with a changed one
 * (its offering and sessions, while nothing is spent), removed when the line no longer sells
 * sessions; returns its id, or null.
 */
async function syncPatientOffering(options: {
  line: PlannedInvoiceLine;
  itemId: number;
  patientId: number | null;
  context: BaseRecordWriteContext;
}): Promise<number | null> {
  const { line, context } = options;
  const current = line.existing?.patient_offering_id ?? null;
  if (line.sessionsTotal === null || options.patientId === null) {
    if (current !== null) await patientOfferingsRepository.deleteById(current);
    return null;
  }
  if (current !== null) {
    await patientOfferingsRepository.update(
      current,
      { offering_id: line.offering?.id, sessions_total: line.sessionsTotal },
      context.userId,
    );
    return current;
  }
  const created = await patientOfferingsRepository.insert({
    organization_id: context.organizationId,
    patient_id: options.patientId,
    offering_id: line.offering?.id,
    invoice_item_id: options.itemId,
    sessions_total: line.sessionsTotal,
    valid_until: line.validUntil,
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
  return created.id;
}
