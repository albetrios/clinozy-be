import {
  type BaseRecordRow,
  replaceLinkedIds,
  resolveRecordIds,
  resolveRecordPublicIds,
} from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordActionInput,
  BaseRecordCollectionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_offering_suggestions } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.schema.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import {
  PAYMENT_DIRECTION,
  PAYMENT_KIND,
} from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import {
  recordPayment,
  splitsToColumns,
  writeBillingActivity,
} from '@/domains/app/sub-domains/billing/payments/payments.ledger.js';
import {
  findRecordedByMemberships,
  PaymentsRepository,
} from '@/domains/app/sub-domains/billing/payments/payments.repository.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { paiseOf, rupees, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { INVOICE_TYPE } from './invoices.constants.js';
import type { InvoiceItemInput, InvoicePaidNowInput } from './invoices.dto.js';
import { type InvoiceLinePlan, planInvoiceLines, writeInvoiceLines } from './invoices.lines.js';
import {
  INVOICE_MEMBERS_LINK,
  type InvoiceItemWriteRow,
  type InvoicesRepository,
} from './invoices.repository.js';
import { invoices } from './invoices.schema.js';
import { serializeInvoiceItem, serializeInvoicePreview } from './invoices.serializer.js';
import type { BilledContactOutput, InvoicePreviewOutput } from './invoices.types.js';
import { validatePreviewInvoice, validatePreviewInvoiceChange } from './invoices.validator.js';

const contactsRepository = new ContactsRepository();
const paymentsRepository = new PaymentsRepository();

/** What a save planned and writes after its invoice row (the lines, the patient, "Paid now"). */
interface PendingInvoiceSave {
  plan: InvoiceLinePlan | null;
  patientId: number | null;
  payment: InvoicePaidNowInput | undefined;
  /** The new patient file when the contact changed (B12). */
  movedToPatientId: number | null;
}

/** The save in flight, by its write context — set by `prepare*`, read by `afterWrite`. */
const pendingSaves = new WeakMap<BaseRecordWriteContext, PendingInvoiceSave>();

/** `2026-27` — the April–March financial year a date falls in (B11). */
export function financialYearOf(date: string): string {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** B3: a clinic or consultation bill's contact has a live patient file — its id; null for medical. */
async function requirePatientFile(options: {
  type: string;
  contactId: unknown;
}): Promise<number | null> {
  if (typeof options.contactId !== 'number') {
    if (options.type === INVOICE_TYPE.MEDICAL) return null;
    throw fieldValidationError({
      field: 'contact_id',
      messageKey: 'errors:validation.invoiceContactRequired',
    });
  }
  const file = await contactsRepository.findPatientFile(options.contactId);
  if (file) return file.id;
  if (options.type === INVOICE_TYPE.MEDICAL) return null;
  throw fieldValidationError({
    field: 'contact_id',
    messageKey: 'errors:validation.invoicePatientFileRequired',
  }).withReason('patient_file_required');
}

/**
 * MDC18: a medical sale's invoice is the sale's — `/invoices` neither changes, deletes nor
 * restores it (the sale's void and restore do); a 409 `invoice_of_sale`.
 */
async function assertNotSaleInvoice({
  repository,
  invoiceId,
}: {
  repository: InvoicesRepository;
  invoiceId: number;
}): Promise<void> {
  if ((await repository.findSaleState(invoiceId)) !== null) {
    throw new ConflictError('errors:invoiceOfSale').withReason('invoice_of_sale');
  }
}

/**
 * MD28: a medicine is sold only through the store — `/invoices` (a bill, a change, either preview)
 * refuses a `medical` bill and any medicine line, which would draw no stock and have no sale; a 400
 * `sold_through_store`. A sale writes its own bill through {@link recordInvoice}.
 */
function refuseStoreSale(values: Record<string, unknown>): void {
  if (values.type === INVOICE_TYPE.MEDICAL) {
    throw fieldValidationError({
      field: 'type',
      messageKey: 'errors:validation.invoiceSoldThroughStore',
    }).withReason('sold_through_store');
  }
  const items = (values.items as { medicine_id?: unknown }[] | undefined) ?? [];
  const index = items.findIndex((item) => item.medicine_id !== undefined);
  if (index >= 0) {
    throw fieldValidationError({
      field: `items/${index}/medicine_id`,
      messageKey: 'errors:validation.invoiceSoldThroughStore',
    }).withReason('sold_through_store');
  }
}

/** A stored line as a change would send it unchanged — the plan keeps its snapshot. */
function keptLine(row: InvoiceItemWriteRow): InvoiceItemInput {
  return {
    id: row.public_id,
    quantity: row.quantity,
    discount_percent: toAmount(row.discount_percent) ?? 0,
  };
}

/**
 * The billed person of each bill or payment on a page (B3): fills `contact` — `{ id, name,
 * primary_phone }` — and sets `patient_id`, the contact's patient file.
 */
export async function attachBilledContacts(outputs: Record<string, unknown>[]): Promise<void> {
  const contactIdOf = (output: Record<string, unknown>): string | null =>
    (output.contact as BilledContactOutput | null)?.id ?? null;
  const contactPublicIds = [...new Set(outputs.flatMap((output) => contactIdOf(output) ?? []))];
  const summaries = new Map(
    (await contactsRepository.findSummaries(contactPublicIds)).map((contact) => [
      contact.id,
      contact,
    ]),
  );
  const patientFiles = await contactsRepository.findPatientFiles(contactPublicIds);
  for (const output of outputs) {
    const contactId = contactIdOf(output);
    const contact = contactId === null ? undefined : summaries.get(contactId);
    output.contact = contact
      ? {
          id: contact.id,
          name: [contact.first_name, contact.last_name].filter(Boolean).join(' '),
          primary_phone: contact.primary_phone,
        }
      : null;
    output.patient_id = contactId === null ? null : (patientFiles.get(contactId)?.id ?? null);
  }
}

/** B13: the drawer's "Paid now" — a receipt against the new bill, up to its total. */
async function recordPaidNow(options: {
  invoice: BaseRecordRow;
  payment: InvoicePaidNowInput;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { invoice, payment, context } = options;
  await recordPayment({
    context,
    values: {
      kind: PAYMENT_KIND.RECEIPT,
      direction: PAYMENT_DIRECTION.RECEIVED,
      branch_id: invoice.branch_id as number,
      contact_id: invoice.contact_id,
      invoice_id: invoice.id,
      paid_at: payment.paid_at === undefined ? new Date() : new Date(payment.paid_at),
      reference: payment.reference ?? null,
      ...splitsToColumns(payment.splits),
    },
  });
}

/** B12, B11: a change is refused once settled, a paid invoice keeps its contact, the date its financial year. */
async function assertInvoiceChangeable(options: {
  values: Readonly<Record<string, unknown>>;
  existing: BaseRecordRow;
  contactChanges: boolean;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { values, existing } = options;
  if (
    await paymentsRepository.invoiceHasSettledPayment(existing.id, options.context.organizationId)
  ) {
    throw new ConflictError('errors:invoiceSettled').withReason('invoice_settled');
  }
  if (options.contactChanges && (toAmount(existing.paid_amount) ?? 0) > 0) {
    throw fieldValidationError({
      field: 'contact_id',
      messageKey: 'errors:validation.invoiceContactFixedOncePaid',
    });
  }
  if (
    typeof values.invoice_date === 'string' &&
    financialYearOf(values.invoice_date) !== existing.financial_year
  ) {
    throw fieldValidationError({
      field: 'invoice_date',
      messageKey: 'errors:validation.invoiceDateOtherFinancialYear',
    });
  }
}

/**
 * B12: re-plans a changed invoice's lines — the sent ones, else the stored ones as they are — and
 * refuses a total under what is paid, or a contact change while a session is spent.
 */
async function replanChangedLines(options: {
  repository: InvoicesRepository;
  values: Record<string, unknown>;
  existing: BaseRecordRow;
  patientId: number | null;
  contactChanges: boolean;
  context: BaseRecordWriteContext;
}): Promise<InvoiceLinePlan> {
  const { values, existing } = options;
  const stored = await options.repository.findItemsForWrite(existing.id);
  if (options.contactChanges && stored.some((line) => (line.sessions_used ?? 0) > 0)) {
    throw new ConflictError('errors:invoiceOfferingInUse').withReason('offering_in_use');
  }
  const plan = await planInvoiceLines({
    context: options.context,
    header: {
      type: String(existing.type),
      branchId: existing.branch_id as number,
      patientId: options.patientId,
      invoiceDate: String(values.invoice_date ?? existing.invoice_date),
      overallDiscount: Number(values.overall_discount ?? toAmount(existing.overall_discount) ?? 0),
    },
    items: (values.items as InvoiceItemInput[] | undefined) ?? stored.map(keptLine),
    existing: stored,
  });
  // What came in — kept or refunded against a credit note — the total can't drop below (B16).
  const received =
    (toAmount(existing.paid_amount) ?? 0) + (toAmount(existing.refunded_amount) ?? 0);
  if (paiseOf(plan.totals.total) < paiseOf(received)) {
    throw new ConflictError('errors:invoiceBelowPaid').withReason('below_paid');
  }
  return plan;
}

/**
 * Plans a new invoice (B8–B13): its type and date defaults, the billed patient, the lines — a
 * preview may plan before the contact is picked (`contactOptional`).
 */
async function planNewInvoice(options: {
  values: Record<string, unknown>;
  context: BaseRecordWriteContext;
  contactOptional?: boolean;
}): Promise<{ plan: InvoiceLinePlan; patientId: number | null }> {
  const { values, context } = options;
  values.type ??= INVOICE_TYPE.CLINIC;
  values.invoice_date ??= await organizationToday(context);
  const patientId =
    options.contactOptional === true && typeof values.contact_id !== 'number'
      ? null
      : await requirePatientFile({ type: String(values.type), contactId: values.contact_id });
  const plan = await planInvoiceLines({
    context,
    header: {
      type: String(values.type),
      branchId: values.branch_id as number,
      patientId,
      invoiceDate: String(values.invoice_date),
      overallDiscount: Number(values.overall_discount ?? 0),
    },
    items: values.items as InvoiceItemInput[],
    existing: [],
  });
  return { plan, patientId };
}

/** Plans a new invoice and keeps the plan for its write: the totals on the row, the lines after (B8–B13). */
async function prepareInvoiceCreate({
  values,
  context,
}: {
  values: Record<string, unknown>;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { plan, patientId } = await planNewInvoice({ values, context });
  Object.assign(values, plan.totals);
  pendingSaves.set(context, {
    plan,
    patientId,
    payment: values.payment as InvoicePaidNowInput | undefined,
    movedToPatientId: null,
  });
  delete values.items;
  delete values.payment;
}

/**
 * Plans a change (B11, B12): the guards, the billed patient, the re-planned lines when they move —
 * always for a preview (`replanAlways`, the stored lines as they are when none are sent).
 */
async function planInvoiceChange(options: {
  repository: InvoicesRepository;
  values: Record<string, unknown>;
  existing: BaseRecordRow;
  context: BaseRecordWriteContext;
  replanAlways?: boolean;
}): Promise<{ plan: InvoiceLinePlan | null; patientId: number | null; contactChanges: boolean }> {
  const { values, existing, context } = options;
  await assertNotSaleInvoice({ repository: options.repository, invoiceId: existing.id });
  refuseStoreSale(values);
  const contactChanges = 'contact_id' in values && values.contact_id !== existing.contact_id;
  await assertInvoiceChangeable({ values, existing, contactChanges, context });
  const patientId = await requirePatientFile({
    type: String(existing.type),
    contactId: contactChanges ? values.contact_id : existing.contact_id,
  });
  const linesMove =
    options.replanAlways === true ||
    'items' in values ||
    'overall_discount' in values ||
    contactChanges;
  const plan = linesMove
    ? await replanChangedLines({
        repository: options.repository,
        values,
        existing,
        patientId,
        contactChanges,
        context,
      })
    : null;
  return { plan, patientId, contactChanges };
}

/** Plans a change and keeps the plan for its write (B11, B12). */
async function prepareInvoiceUpdate(options: {
  repository: InvoicesRepository;
  values: Record<string, unknown>;
  existing: BaseRecordRow;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { values, context } = options;
  const { plan, patientId, contactChanges } = await planInvoiceChange(options);
  if (plan) Object.assign(values, plan.totals);
  pendingSaves.set(context, {
    plan,
    patientId,
    payment: undefined,
    movedToPatientId: contactChanges ? patientId : null,
  });
  delete values.items;
}

/**
 * After a save's row: the moved patient offerings, the lines (B13, B28) and — on a create — "Paid
 * now" and the activity entry (B7); a delete or restore takes the patient offerings with it (B14).
 */
async function afterInvoiceWrite(options: {
  repository: InvoicesRepository;
  row: BaseRecordRow;
  kind: string;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, row, context } = options;
  if (options.kind === 'delete' || options.kind === 'restore') {
    await repository.setOfferingsDeleted({
      invoiceId: row.id,
      deleted:
        options.kind === 'delete'
          ? {
              reason: String(row.delete_reason),
              note: row.delete_note ?? null,
            }
          : null,
      userId: context.userId,
    });
    return;
  }
  const pending = pendingSaves.get(context);
  pendingSaves.delete(context);
  if (!pending) return;
  if (pending.movedToPatientId !== null) {
    await repository.moveOfferingsToPatient({
      invoiceId: row.id,
      patientId: pending.movedToPatientId,
      userId: context.userId,
    });
  }
  if (pending.plan) {
    await writeInvoiceLines({
      repository,
      invoice: row,
      plan: pending.plan,
      patientId: pending.patientId,
      context,
    });
  }
  if (options.kind !== 'create') return;
  if (pending.payment) await recordPaidNow({ invoice: row, payment: pending.payment, context });
  await writeBillingActivity({
    context,
    contactId: row.contact_id,
    body: `Invoice ${String(row.invoice_number)} billed: ${rupees(toAmount(row.total) ?? 0)}`,
    link: { invoice_id: row.id },
  });
}

/** A plan as a preview answers it, with the public ids its lines name — one read per kind of id. */
async function previewOf(options: {
  plan: InvoiceLinePlan;
  type: string;
  invoiceDate: string;
  overallDiscount: number;
  paidAmount: number;
  refundedAmount: number;
}): Promise<InvoicePreviewOutput> {
  const idsOf = (field: string) =>
    options.plan.lines.flatMap((line) => {
      const value = line.values[field];
      return typeof value === 'number' ? [value] : [];
    });
  return serializeInvoicePreview({
    plan: options.plan,
    type: options.type,
    invoice_date: options.invoiceDate,
    overall_discount: options.overallDiscount,
    paid_amount: options.paidAmount,
    refunded_amount: options.refundedAmount,
    public_ids: {
      offerings: await resolveRecordPublicIds({ table: offerings, ids: idsOf('offering_id') }),
      medicines: await resolveRecordPublicIds({ table: medicines, ids: idsOf('medicine_id') }),
      suggestions: await resolveRecordPublicIds({
        table: patient_offering_suggestions,
        ids: idsOf('patient_offering_suggestion_id'),
      }),
    },
  });
}

/**
 * D81, Q2: what `POST /app/invoices` would write — the lines and the totals — nothing written. The
 * branch is one of the caller's, the references are live here (the 400s of the bill); the contact
 * may wait (a clinic or consultation bill's contact, once sent, needs a patient file).
 */
async function previewInvoice(input: BaseRecordCollectionInput): Promise<InvoicePreviewOutput> {
  const { member_ids: _memberIds, ...parsed } = validatePreviewInvoice(input.input);
  const values: Record<string, unknown> = { ...parsed };
  refuseStoreSale(values);
  await input.resolveReferences(values);
  const visible = await input.branchScope([parsed.branch_id]);
  if (visible && !visible.ids.includes(values.branch_id as number)) {
    throw fieldValidationError({
      field: 'branch_id',
      messageKey: 'errors:validation.branchNotYours',
    });
  }
  const { plan } = await planNewInvoice({ values, context: input.context, contactOptional: true });
  return previewOf({
    plan,
    type: String(values.type),
    invoiceDate: String(values.invoice_date),
    overallDiscount: Number(values.overall_discount ?? 0),
    paidAmount: 0,
    refundedAmount: 0,
  });
}

/**
 * D81: what `PATCH /app/invoices/{invoice_id}` would write — the lines (the sent ones, else the
 * stored ones) and the totals — nothing written; it refuses what the change would (settled, a
 * sale's, a total under what is paid, a spent session).
 */
async function previewInvoiceChange({
  repository,
  input,
}: {
  repository: InvoicesRepository;
  input: BaseRecordActionInput;
}): Promise<InvoicePreviewOutput> {
  const { existing, context } = input;
  const { member_ids: _memberIds, ...parsed } = validatePreviewInvoiceChange(input.input);
  const values: Record<string, unknown> = { ...parsed };
  if (typeof parsed.contact_id === 'string') {
    const ids = await resolveRecordIds({
      table: contacts,
      organizationId: context.organizationId,
      publicIds: [parsed.contact_id],
    });
    const contactId = ids.get(parsed.contact_id);
    if (contactId === undefined) {
      throw fieldValidationError({
        field: 'contact_id',
        messageKey: 'errors:validation.recordReferenceNotFound',
        messageParams: { id: parsed.contact_id, label: 'contact' },
      });
    }
    values.contact_id = contactId;
  }
  const { plan } = await planInvoiceChange({
    repository,
    values,
    existing,
    context,
    replanAlways: true,
  });
  return previewOf({
    plan: plan!,
    type: String(existing.type),
    invoiceDate: String(values.invoice_date ?? existing.invoice_date),
    overallDiscount: Number(values.overall_discount ?? toAmount(existing.overall_discount) ?? 0),
    paidAmount: toAmount(existing.paid_amount) ?? 0,
    refundedAmount: toAmount(existing.refunded_amount) ?? 0,
  });
}

/**
 * Writes an invoice another write makes in its transaction — a medical sale's bill (MD7, MD19):
 * the plan, the row, its lines, its credited team, "Paid now" and the activity entry, as
 * `POST /invoices` does. `values` are column values (references resolved) plus `items`,
 * `payment` and `member_ids` (membership ids).
 *
 * @remarks
 * - **Failure modes:** as `POST /invoices` — `ValidationError` on `items`, `overall_discount`;
 *   `ConflictError` `more_than_due`, `day_closed`.
 */
export async function recordInvoice(options: {
  repository: InvoicesRepository;
  values: Record<string, unknown> & { member_ids?: readonly number[] };
  context: BaseRecordWriteContext;
}): Promise<BaseRecordRow> {
  const { repository, context } = options;
  const { member_ids: memberIds = [], ...values } = options.values;
  await prepareInvoiceCreate({ values, context });
  const row = await repository.insert({
    ...values,
    organization_id: context.organizationId,
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
  await replaceLinkedIds({
    link: INVOICE_MEMBERS_LINK,
    ownerId: row.id,
    targetIds: memberIds,
    organizationId: context.organizationId,
    createdByUserId: context.userId,
  });
  await afterInvoiceWrite({ repository, row, kind: 'create', context });
  return row;
}

/**
 * The invoice rules (launch ROUTE #136, routes-final 8.A): the billed person, the lines and their
 * amounts, what a change or a delete may do, "Paid now", the activity entry, and what a page reads.
 *
 * @remarks
 * - **Algorithm:** a save plans its lines first ({@link planInvoiceLines} — B8–B10, B28) and
 *   stores the totals on the invoice row; after the row is written the lines, their patient
 *   offerings, plan links and billed treatments follow ({@link writeInvoiceLines}), then "Paid now"
 *   (B13) and a `system` entry (B7) — one transaction. A change is refused once settled (B12), may
 *   not move the date to another financial year (B11) or the total under what is paid; a contact
 *   change (nothing paid) moves the patient offerings with it. A delete needs nothing paid or
 *   credited and no spent session (B14); its patient offerings go and come back with it. A
 *   medical sale's invoice is the sale's (MDC18) — changing, deleting or restoring it here is a
 *   409 `invoice_of_sale`; a `medical` bill or a medicine line through `/invoices` is a 400
 *   `sold_through_store` (MD28 — the sale writes its own, {@link recordInvoice}). The previews
 *   (`preview` — a bill, or a change of one) plan the same way
 *   and write nothing (D81, Q2); a page reads who billed each invoice (D81).
 * - **Failure modes:** `ValidationError` on `contact_id` (`patient_file_required`), `items`,
 *   `invoice_date`, `overall_discount`, `patient_treatment_ids`, `below_lowest_price`;
 *   `ConflictError` `invoice_of_sale`, `invoice_settled`, `below_paid`, `offering_in_use`, `invoice_paid`,
 *   `treatment_billed`, `more_than_due`, `day_closed`.
 */
export function createInvoicesRules(repository: InvoicesRepository): BaseRecordRules {
  return {
    prepareCreate: (values, context) => {
      refuseStoreSale(values);
      return prepareInvoiceCreate({ values, context });
    },
    prepareUpdate: (values, existing, context) =>
      prepareInvoiceUpdate({ repository, values, existing, context }),
    prepareRemove: async (existing) => {
      await assertNotSaleInvoice({ repository, invoiceId: existing.id });
      if (
        (toAmount(existing.paid_amount) ?? 0) > 0 ||
        (await repository.hasLiveCreditNote(existing.id))
      ) {
        throw new ConflictError('errors:invoicePaid').withReason('invoice_paid');
      }
      if (await repository.hasSpentOffering(existing.id)) {
        throw new ConflictError('errors:invoiceOfferingInUse').withReason('offering_in_use');
      }
    },
    prepareRestore: (deleted) => assertNotSaleInvoice({ repository, invoiceId: deleted.id }),
    afterWrite: (row, change, context) =>
      afterInvoiceWrite({ repository, row, kind: change.kind, context }),
    collectionViews: { preview: previewInvoice },
    views: { preview: (input) => previewInvoiceChange({ repository, input }) },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: invoices,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const recordedBy = await findRecordedByMemberships({
        table: invoices,
        ids: [...idsByPublicId.values()],
        organizationId: context.organizationId,
      });
      const items = await repository.findItems([...idsByPublicId.values()]);
      const billed = await repository.findBilledTreatments(
        items.flatMap((item) => (item.patient_offering_id ? [item.patient_offering_id] : [])),
      );
      const settled = await paymentsRepository.findSettledInvoices(
        [...idsByPublicId.values()],
        context.organizationId,
      );
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        output.items = items
          .filter((item) => item.invoice_id === id)
          .map((item) =>
            serializeInvoiceItem({
              row: item,
              treatmentIds: item.patient_offering_id
                ? (billed.get(item.patient_offering_id) ?? [])
                : [],
            }),
          );
        output.is_settled = id !== undefined && settled.has(id);
        output.created_by_membership_id = id === undefined ? null : (recordedBy.get(id) ?? null);
      }
      await attachBilledContacts(outputs);
    },
  };
}
