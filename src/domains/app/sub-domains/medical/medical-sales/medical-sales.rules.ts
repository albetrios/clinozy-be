import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import {
  type BaseRecordRow,
  findMembershipIdOfUser,
  resolveRecordIds,
} from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordActionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { recordCreditNote } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.rules.js';
import { INVOICE_TYPE } from '@/domains/app/sub-domains/billing/invoices/invoices.constants.js';
import type { InvoicePaidNowInput } from '@/domains/app/sub-domains/billing/invoices/invoices.dto.js';
import type { InvoiceLineInput } from '@/domains/app/sub-domains/billing/invoices/invoices.lines.js';
import { InvoicesRepository } from '@/domains/app/sub-domains/billing/invoices/invoices.repository.js';
import {
  attachBilledContacts,
  recordInvoice,
} from '@/domains/app/sub-domains/billing/invoices/invoices.rules.js';
import { MedicinesRepository } from '@/domains/app/sub-domains/medical/medicines/medicines.repository.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import {
  drawMedicineFromBatches,
  moveMedicineBatch,
} from '@/domains/app/sub-domains/medical/medicines/medicines.stock.js';
import { PATIENT_PRESCRIPTION_STATUS } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.constants.js';
import { PatientPrescriptionsRepository } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.repository.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import {
  MEDICAL_SALE_RESTOCKED_REASON_VALUES,
  MEDICAL_SALE_STATUS,
} from './medical-sales.constants.js';
import { type CreateMedicalSaleInput, ReturnMedicalSaleDto } from './medical-sales.dto.js';
import type { MedicalSaleLineRow, MedicalSalesRepository } from './medical-sales.repository.js';

const contactsRepository = new ContactsRepository();
const invoicesRepository = new InvoicesRepository();
const medicinesRepository = new MedicinesRepository();
const prescriptionsRepository = new PatientPrescriptionsRepository();

/** Rupees as paise, for exact sums. */
function paiseOf(value: unknown): number {
  return Math.round((toAmount(value) ?? 0) * 100);
}

/** `S-983` — a sale's display number. */
function saleLabel(sale: BaseRecordRow): string {
  return `S-${Number(sale.sale_number)}`;
}

/** MD19: the prescription a sale fills is an approved one of the buyer's patient file — else a 400. */
async function assertPrescriptionOfContact(options: {
  prescriptionId: unknown;
  contactId: number;
}): Promise<void> {
  if (typeof options.prescriptionId !== 'number') return;
  const file = await contactsRepository.findPatientFile(options.contactId);
  const prescription = await prescriptionsRepository.findById(options.prescriptionId);
  if (
    !file ||
    prescription?.patient_id !== file.id ||
    prescription.status !== PATIENT_PRESCRIPTION_STATUS.APPROVED
  ) {
    throw fieldValidationError({
      field: 'patient_prescription_id',
      messageKey: 'errors:validation.medicalSalePrescriptionNotTheBuyers',
    });
  }
}

/** "Prescribed by": active members of the organization — their ids; else a 400 `member_ids`. */
async function resolveMemberIds({
  publicIds,
  context,
}: {
  publicIds: readonly string[] | undefined;
  context: BaseRecordWriteContext;
}): Promise<number[]> {
  if (!publicIds || publicIds.length === 0) return [];
  const ids = await resolveRecordIds({
    table: memberships,
    organizationId: context.organizationId,
    publicIds,
    equals: { status: MEMBERSHIP_STATUS.ACTIVE },
  });
  const unknown = publicIds.find((publicId) => !ids.has(publicId));
  if (unknown !== undefined) {
    throw fieldValidationError({
      field: 'member_ids',
      messageKey: 'errors:validation.recordReferenceNotFound',
      messageParams: { id: unknown, label: 'team member' },
    });
  }
  return publicIds.map((publicId) => ids.get(publicId)!);
}

/**
 * MD5, MD19: each line's medicine taken from its unexpired batches, earliest expiry first — the
 * invoice's lines, one per batch drawn (its number and id), at the line's discount (the medicine's
 * near-expiry discount unless sent).
 */
async function drawSaleLines(options: {
  items: CreateMedicalSaleInput['items'];
  context: BaseRecordWriteContext;
}): Promise<InvoiceLineInput[]> {
  const { items, context } = options;
  const ids = await resolveRecordIds({
    table: medicines,
    organizationId: context.organizationId,
    publicIds: items.map((item) => item.medicine_id),
  });
  const rows = await medicinesRepository.findLive([...ids.values()]);
  const lines: InvoiceLineInput[] = [];
  for (const item of items) {
    const medicine = rows.get(ids.get(item.medicine_id) ?? 0);
    if (!medicine) {
      throw fieldValidationError({
        field: 'items',
        messageKey: 'errors:validation.invoiceMedicineNotLive',
        messageParams: { id: item.medicine_id },
      });
    }
    const discount = item.discount_percent ?? toAmount(medicine.near_expiry_discount_percent) ?? 0;
    const draws = await drawMedicineFromBatches({ context, medicine, quantity: item.quantity });
    for (const draw of draws) {
      lines.push({
        medicine_id: item.medicine_id,
        quantity: draw.quantity,
        discount_percent: discount,
        batch_number: draw.batch.batch_number,
        medicine_batch_id: draw.batch.id,
      });
    }
  }
  return lines;
}

/**
 * MD19: a new sale — the prescription checked, the stock drawn by earliest expiry, the `medical`
 * invoice written through the invoice ledger (its lines, team, "Paid now" and activity entry), and
 * the sale pointing at it; one transaction.
 */
async function prepareSale({
  values,
  context,
}: {
  values: Record<string, unknown>;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const contactId = values.contact_id as number;
  await assertPrescriptionOfContact({ prescriptionId: values.patient_prescription_id, contactId });
  const memberIds = await resolveMemberIds({
    publicIds: values.member_ids as string[] | undefined,
    context,
  });
  const items = await drawSaleLines({
    items: values.items as CreateMedicalSaleInput['items'],
    context,
  });
  const invoice = await recordInvoice({
    repository: invoicesRepository,
    values: {
      type: INVOICE_TYPE.MEDICAL,
      branch_id: values.branch_id,
      contact_id: contactId,
      invoice_date: await organizationToday(context),
      overall_discount: values.overall_discount ?? 0,
      remark: values.remark ?? null,
      patient_prescription_id: values.patient_prescription_id ?? null,
      items,
      payment: values.payment as InvoicePaidNowInput | undefined,
      member_ids: memberIds,
    },
    context,
  });
  for (const key of ['items', 'overall_discount', 'member_ids', 'remark', 'payment']) {
    delete values[key];
  }
  values.invoice_id = invoice.id;
  values.sold_at = new Date();
}

/** MD20: a sale is voided only with nothing paid on its invoice and nothing returned. */
async function assertVoidable({
  repository,
  sale,
}: {
  repository: MedicalSalesRepository;
  sale: BaseRecordRow;
}): Promise<void> {
  const invoice = await invoicesRepository.findById(sale.invoice_id as number);
  if (
    paiseOf(invoice?.paid_amount) > 0 ||
    (await invoicesRepository.hasLiveCreditNote(sale.invoice_id as number))
  ) {
    throw new ConflictError('errors:medicalSaleHasPayments').withReason('sale_has_payments');
  }
  if (await repository.hasReturns(sale.id)) {
    throw new ConflictError('errors:medicalSaleHasReturns').withReason('sale_has_returns');
  }
}

/**
 * MD20: a void puts each line back into its batch (`sign` 1) and deletes the invoice; its undo
 * takes the stock again (`sign` −1 — 409 `not_enough_stock`) and restores the invoice.
 */
async function moveSaleStock(options: {
  repository: MedicalSalesRepository;
  sale: BaseRecordRow;
  sign: 1 | -1;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { sale, sign, context } = options;
  const lines = await options.repository.findLines([sale.invoice_id as number]);
  for (const line of lines) {
    if (line.medicine_batch_id === null) continue;
    await moveMedicineBatch({
      context,
      batchId: line.medicine_batch_id,
      change: sign * line.quantity,
      name: line.name,
    });
  }
  if (sign === 1) {
    await invoicesRepository.softDelete(
      sale.invoice_id as number,
      { delete_reason: 'other', delete_note: `Sale ${saleLabel(sale)} voided` },
      context.userId,
    );
    return;
  }
  await invoicesRepository.restore(sale.invoice_id as number, context.userId);
}

/** MD21: one returned line, checked against what is left of it, and its share of the amount. */
function returnedLine(options: {
  line: MedicalSaleLineRow | undefined;
  invoiceItemId: string;
  quantity: number;
  restocks: boolean;
}): { line: MedicalSaleLineRow; quantity: number; paise: number; restocks: boolean } {
  const { line, quantity } = options;
  if (!line || quantity > line.quantity - line.returned_quantity) {
    throw fieldValidationError({
      field: 'items',
      messageKey: 'errors:validation.medicalSaleReturnLine',
      messageParams: { id: options.invoiceItemId },
    });
  }
  return {
    line,
    quantity,
    paise: Math.round((paiseOf(line.amount) * quantity) / line.quantity),
    restocks: options.restocks,
  };
}

/**
 * MD21: "Return from patient" — on a sale paid in full, the lines (up to what is left of each)
 * come back: the refund is their share of the amounts, a credit note on the invoice with its
 * refund payment (B16); unused, doctor-changed and wrong-item packs go back into their batch, the
 * rest are written off.
 */
async function returnSale(input: BaseRecordActionInput): Promise<BaseRecordRow> {
  const { existing: sale, context } = input;
  const repository = input.repository as MedicalSalesRepository;
  const body = parseWithSchema({ schema: ReturnMedicalSaleDto, data: input.input });
  const invoice = await invoicesRepository.findById(sale.invoice_id as number);
  const credited = await repository.findCreditedAmount(sale.invoice_id as number);
  if (
    !invoice ||
    paiseOf(invoice.paid_amount) + Math.round(credited * 100) < paiseOf(invoice.total)
  ) {
    throw new ConflictError('errors:medicalSaleNotPaid').withReason('sale_not_paid');
  }
  const lines = new Map(
    (await repository.findLines([invoice.id])).map((line) => [line.public_id, line]),
  );
  const restocks = (MEDICAL_SALE_RESTOCKED_REASON_VALUES as readonly string[]).includes(
    body.reason,
  );
  const returned = body.items.map((item) =>
    returnedLine({
      line: lines.get(item.invoice_item_id),
      invoiceItemId: item.invoice_item_id,
      quantity: item.quantity,
      restocks,
    }),
  );
  const totalPaise = returned.reduce((total, item) => total + item.paise, 0);
  const creditNote = await recordCreditNote({
    context,
    invoice,
    amount: totalPaise / 100,
    reason: `Sale ${saleLabel(sale)} returned: ${body.reason}`,
    splits: [{ mode: body.refund_mode, amount: totalPaise / 100 }],
    note: body.note ?? null,
  });
  await repository.insertReturn({
    values: {
      organization_id: context.organizationId,
      medical_sale_id: sale.id,
      reason: body.reason,
      refund_mode: body.refund_mode,
      note: body.note ?? null,
      amount: (totalPaise / 100).toFixed(2),
      invoice_credit_note_id: creditNote.id,
      returned_by_membership_id: await findMembershipIdOfUser({
        organizationId: context.organizationId,
        userId: context.userId,
      }),
      created_by_user_id: context.userId,
    },
    items: returned.map((item) => ({
      invoice_item_id: item.line.id,
      quantity: item.quantity,
      amount: (item.paise / 100).toFixed(2),
      is_restocked: item.restocks,
    })),
  });
  for (const item of returned) {
    if (!item.restocks || item.line.medicine_batch_id === null) continue;
    await moveMedicineBatch({
      context,
      batchId: item.line.medicine_batch_id,
      change: item.quantity,
      name: item.line.name,
    });
  }
  return sale;
}

/** A sold line as a page shows it (11.H.6). */
function lineOutput(line: MedicalSaleLineRow): Record<string, unknown> {
  return {
    invoice_item_id: line.public_id,
    medicine_id: line.medicine_id,
    name: line.name,
    batch_number: line.batch_number,
    expiry_month: line.expiry_month?.slice(0, 7) ?? null,
    quantity: line.quantity,
    rate: toAmount(line.rate) ?? 0,
    discount_percent: toAmount(line.discount_percent) ?? 0,
    amount: toAmount(line.amount) ?? 0,
    returned_quantity: line.returned_quantity,
  };
}

/** MD21: a live sale's status — returned (any return), else paid or unpaid by its invoice's due. */
function liveStatus({
  hasReturns,
  dueAmount,
}: {
  hasReturns: boolean;
  dueAmount: unknown;
}): string {
  if (hasReturns) return MEDICAL_SALE_STATUS.RETURNED;
  return paiseOf(dueAmount) <= 0 ? MEDICAL_SALE_STATUS.PAID : MEDICAL_SALE_STATUS.UNPAID;
}

/** The invoice, lines, team, returns, margin and status of a page's sales (11.H.6). */
async function decorateSales(options: {
  repository: MedicalSalesRepository;
  outputs: Record<string, unknown>[];
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, outputs, context } = options;
  const rows = await repository.findByPublicIds({
    organizationId: context.organizationId,
    publicIds: outputs.map((output) => String(output.id)),
  });
  const invoiceIds = rows.map((row) => row.invoice_id as number);
  const invoiceRows = await repository.findInvoices(invoiceIds);
  const lines = await repository.findLines(invoiceIds);
  const members = await repository.findMemberIds(invoiceIds);
  const { returns, items } = await repository.findReturns(rows.map((row) => row.id));
  for (const output of outputs) {
    const row = rows.find((candidate) => candidate.public_id === output.id);
    if (!row) continue;
    const invoiceId = row.invoice_id as number;
    const invoice = invoiceRows.get(invoiceId);
    const own = lines.filter((line) => line.invoice_id === invoiceId);
    const ownReturns = returns.filter((entry) => entry.medical_sale_id === row.id);
    const salePaise = own.reduce((total, line) => total + paiseOf(line.amount), 0);
    const costPaise = own.reduce(
      (total, line) => total + Math.round(paiseOf(line.purchase_rate) * line.quantity),
      0,
    );
    output.invoice = invoice
      ? {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          total: toAmount(invoice.total) ?? 0,
          paid_amount: toAmount(invoice.paid_amount) ?? 0,
          due_amount: toAmount(invoice.due_amount) ?? 0,
          payment_status: invoice.payment_status,
        }
      : null;
    output.remark = invoice?.remark ?? null;
    output.items = own.map(lineOutput);
    output.member_ids = members.get(invoiceId) ?? [];
    output.returns = ownReturns.map(
      ({ medical_sale_id: _sale, key, amount, created_at, ...entry }) => ({
        ...entry,
        amount: toAmount(amount) ?? 0,
        items: items
          .filter((item) => item.medical_sale_return_id === key)
          .map(({ medical_sale_return_id: _return, amount: itemAmount, ...item }) => ({
            ...item,
            amount: toAmount(itemAmount) ?? 0,
          })),
        created_at: created_at.toISOString(),
      }),
    );
    output.returned_amount =
      ownReturns.reduce((total, entry) => total + paiseOf(entry.amount), 0) / 100;
    output.margin_amount = (salePaise - costPaise) / 100;
    output.margin_percent =
      salePaise > 0 ? Math.round(((salePaise - costPaise) / salePaise) * 10000) / 100 : null;
    if (row.deleted_at === null) {
      output.status = liveStatus({
        hasReturns: ownReturns.length > 0,
        dueAmount: invoice?.due_amount,
      });
    }
  }
  await attachBilledContacts(outputs);
}

/**
 * The medical sale rules (launch ROUTE #153, routes-final 11.H, MD19–MD21): a sale through the
 * invoice ledger with its stock, the void and its undo, the return, and what a page reads.
 *
 * @remarks
 * - **Algorithm:** a create checks the prescription (an approved one of the buyer's file, filled
 *   once — the unique index), draws each medicine from its unexpired batches (MD5) and writes the
 *   `medical` invoice with one line per batch, "Paid now" and its team (MD7, MD19) before the sale
 *   row. A void needs nothing paid and nothing returned; it puts the stock back and deletes the
 *   invoice; the undo takes the stock again and restores the invoice. The `returns` action refunds
 *   the returned lines' share through a credit note and restocks or writes them off (MD21). Every
 *   read adds the buyer, the invoice, its lines and team, the returns, the margin and the status.
 * - **Failure modes:** `ValidationError` on `items`, `member_ids`, `patient_prescription_id`;
 *   `ConflictError` `not_enough_stock`, `prescription_filled`, `day_closed`, `more_than_due`,
 *   `sale_has_payments`, `sale_has_returns`, `sale_not_paid`, `more_than_paid`.
 */
export function createMedicalSalesRules(repository: MedicalSalesRepository): BaseRecordRules {
  return {
    prepareCreate: (values, context) => prepareSale({ values, context }),
    prepareRemove: async (existing, context) => {
      await assertVoidable({ repository, sale: existing });
      await moveSaleStock({ repository, sale: existing, sign: 1, context });
    },
    prepareRestore: (deleted, context) =>
      moveSaleStock({ repository, sale: deleted, sign: -1, context }),
    actions: { returns: returnSale },
    decorate: (outputs, context) => decorateSales({ repository, outputs, context }),
  };
}
