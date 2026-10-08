import type { ZodType } from 'zod';
import { listAppointmentsQueryDto } from '@/domains/app/sub-domains/appointments/appointments.dto.js';
import { listInvoicesQueryDto } from '@/domains/app/sub-domains/billing/invoices/invoices.dto.js';
import { listLeadsQueryDto } from '@/domains/app/sub-domains/leads/leads.dto.js';
import { listOfferingsQueryDto } from '@/domains/app/sub-domains/offerings/offerings.dto.js';
import { listPatientsQueryDto } from '@/domains/app/sub-domains/patients/patients.dto.js';
import { listPaymentsQueryDto } from '@/domains/app/sub-domains/billing/payments/payments.dto.js';
import { listMedicalPurchaseOrdersQueryDto } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.dto.js';
import { listMedicalSalesQueryDto } from '@/domains/app/sub-domains/medical/medical-sales/medical-sales.dto.js';
import { listMedicinesQueryDto } from '@/domains/app/sub-domains/medical/medicines/medicines.dto.js';
import { listMembershipsQueryDto } from '@/domains/tenancy/sub-domains/membership/membership.dto.js';

/** The query parameters that page or sort a list — never part of a saved view (the sort stays in the URL). */
const PAGING_AND_SORT = { after: true, limit: true, sort: true, order: true } as const;

/**
 * The lists a member can save views on (launch U5), each with the filters it takes: its own list
 * query without paging and sort — the medical store's medicines, sales and orders among them
 * (launch #153, MDC5).
 */
export const MEMBERSHIP_SAVED_VIEW_LIST_KEYS = [
  'patients',
  'leads',
  'appointments',
  'invoices',
  'payments',
  'offerings',
  'memberships',
  'medicines',
  'medical_sales',
  'medical_purchase_orders',
] as const;

/** A key of {@link MEMBERSHIP_SAVED_VIEW_LIST_KEYS}. */
export type MembershipSavedViewListKey = (typeof MEMBERSHIP_SAVED_VIEW_LIST_KEYS)[number];

/**
 * The filters each list takes — the schema a saved view's `filters` must pass (launch U5).
 *
 * @remarks
 * - **Algorithm:** each list's own `list…QueryDto` with `after`, `limit`, `sort` and `order` left
 *   out; the schemas are strict, so a key the list doesn't take fails.
 * - **Notes:** a list rebuilt in a later row keeps its `list…QueryDto`, so its views follow it.
 */
export const MEMBERSHIP_SAVED_VIEW_LIST_FILTERS: Record<MembershipSavedViewListKey, ZodType> = {
  patients: listPatientsQueryDto.omit(PAGING_AND_SORT),
  leads: listLeadsQueryDto.omit(PAGING_AND_SORT),
  appointments: listAppointmentsQueryDto.omit(PAGING_AND_SORT),
  invoices: listInvoicesQueryDto.omit(PAGING_AND_SORT),
  payments: listPaymentsQueryDto.omit(PAGING_AND_SORT),
  offerings: listOfferingsQueryDto.omit(PAGING_AND_SORT),
  memberships: listMembershipsQueryDto.omit(PAGING_AND_SORT),
  medicines: listMedicinesQueryDto.omit(PAGING_AND_SORT),
  medical_sales: listMedicalSalesQueryDto.omit(PAGING_AND_SORT),
  medical_purchase_orders: listMedicalPurchaseOrdersQueryDto.omit(PAGING_AND_SORT),
};
