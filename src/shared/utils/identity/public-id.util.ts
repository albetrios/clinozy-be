import { randomBytes } from 'node:crypto';

/** 21-char URL-safe core id length (NanoID-compatible) appended after the entity prefix. */
export const PUBLIC_ID_LENGTH = 21;

/**
 * Per-entity public-id prefixes (Paddle-style typed identifiers): every
 * externally visible id is `<prefix>_<21 chars of [a-z0-9]>`, e.g.
 * `org_4f9c2k7d1m3p5q8r2t0vx`. The prefix makes ids self-describing in logs,
 * docs, and support tickets, and lets validators reject an id of the wrong
 * entity before any lookup.
 */
export const PUBLIC_ID_PREFIXES = {
  user: 'usr',
  organization: 'org',
  membership: 'mem',
  membershipInvitation: 'inv',
  memberRole: 'rol',
  organizationApiKey: 'key',
  branch: 'brn',
  organizationNotificationPolicy: 'pol',
  authSession: 'ses',
  authMethod: 'am',
  webauthnCredential: 'wac',
  notification: 'ntf',
  webhook: 'whk',
  plan: 'pln',
  subscription: 'sub',
  upload: 'upl',
  userDataExport: 'exp',
  webhookDeliveryAttempt: 'wda',
  auditLog: 'aud',
  membershipSavedView: 'svw',
  offeringGroup: 'ogr',
  room: 'room',
  machine: 'mach',
  branchHoliday: 'bhol',
  offering: 'off',
  offer: 'ofr',
  membershipPreference: 'upref',
  patient: 'pat',
  lead: 'lead',
  leadRead: 'lread',
  messageTemplate: 'mtpl',
  appointment: 'appt',
  visit: 'vis',
  diagnosis: 'dgn',
  patientClinicalNote: 'pcn',
  prescription: 'rx',
  prescriptionKit: 'rxk',
  patientImage: 'pimg',
  patientReport: 'prep',
  patientNote: 'pnote',
  invoice: 'invc',
  patientPackage: 'ppkg',
  offeringSuggestion: 'osug',
  patientIdea: 'pidea',
  payment: 'pay',
  paymentEdit: 'pedit',
  creditNote: 'cn',
  pendingCredit: 'pcr',
  dayClose: 'dcl',
  dayCloseEvent: 'dce',
  treatment: 'trt',
  checkIn: 'chk',
  review: 'rev',
  feedbackAction: 'fba',
  manufacturer: 'mfr',
  supplier: 'sup',
  medicalRep: 'mrep',
  medicalRepVisit: 'mrv',
  medicine: 'med',
  medicalPurchaseOrder: 'mpo',
  medicalContact: 'mcon',
  medicalSale: 'msal',
  supplierCredit: 'scr',
  stockVendor: 'svnd',
  stockItem: 'sitm',
  stockPurchase: 'spur',
  stockCount: 'scnt',
  stockMovement: 'smov',
  task: 'task',
  taskOwnerChange: 'toc',
  taskRuleSetting: 'trs',
  message: 'msg',
} as const;

/** Entity keys of {@link PUBLIC_ID_PREFIXES}. */
export type PublicIdEntity = keyof typeof PUBLIC_ID_PREFIXES;

/** Union of the prefix strings themselves (`'usr' | 'org' | …`). */
export type PublicIdPrefix = (typeof PUBLIC_ID_PREFIXES)[PublicIdEntity];

/**
 * Matches any well-formed public id: a known-style lowercase prefix plus the
 * 21-char `[a-z0-9]` core (e.g. `org_a1b2c3d4e5f6g7h8i9j0k`). Used by the
 * tenant header check and generic param validation; entity-specific
 * validation should additionally pin the exact prefix.
 */
export const PUBLIC_ID_REGEX = /^[a-z]{2,5}_[a-z0-9]{21}$/;

/** Builds the strict per-entity pattern (e.g. `^org_[a-z0-9]{21}$`) for validators and docs. */
export function publicIdPatternFor(entity: PublicIdEntity): RegExp {
  return new RegExp(`^${PUBLIC_ID_PREFIXES[entity]}_[a-z0-9]{21}$`);
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ALPHABET_SIZE = ALPHABET.length; // 36

function generatePublicIdCore(): string {
  const maxByte = Math.floor(256 / ALPHABET_SIZE) * ALPHABET_SIZE; // 252
  const result: string[] = [];

  while (result.length < PUBLIC_ID_LENGTH) {
    const bytes = randomBytes(PUBLIC_ID_LENGTH - result.length + 4); // extra buffer
    for (const byte of bytes) {
      if (byte >= maxByte) continue; // reject biased bytes
      result.push(ALPHABET[byte % ALPHABET_SIZE]!);
      if (result.length === PUBLIC_ID_LENGTH) break;
    }
  }

  return result.join('');
}

/**
 * Generate a cryptographically secure, entity-prefixed public ID
 * (`<prefix>_<21 chars>`). Uses rejection sampling to eliminate modulo bias:
 * floor(256 / 36) * 36 = 252, so bytes >= 252 are rejected.
 */
export function generatePublicId(entity: PublicIdEntity): string {
  return `${PUBLIC_ID_PREFIXES[entity]}_${generatePublicIdCore()}`;
}

/**
 * Route path-param name → public-id entity. Single source for entity-strict
 * param validation, materialized test placeholders, and the per-param
 * OpenAPI documentation (description, `^pfx_[a-z0-9]{21}$` pattern, example).
 */
export const PARAM_NAME_TO_ENTITY = {
  user_id: 'user',
  membership_id: 'membership',
  membership_invitation_id: 'membershipInvitation',
  role_id: 'memberRole',
  api_key_id: 'organizationApiKey',
  branch_id: 'branch',
  notification_policy_id: 'organizationNotificationPolicy',
  session_id: 'authSession',
  mfa_method_id: 'authMethod',
  credential_id: 'webauthnCredential',
  notification_id: 'notification',
  webhook_id: 'webhook',
  plan_id: 'plan',
  subscription_id: 'subscription',
  upload_id: 'upload',
  data_export_id: 'userDataExport',
  auth_method_id: 'authMethod',
  membership_saved_view_id: 'membershipSavedView',
  offering_group_id: 'offeringGroup',
  branch_room_id: 'room',
  branch_machine_id: 'machine',
  branch_holiday_id: 'branchHoliday',
  offering_id: 'offering',
  offer_id: 'offer',
  patient_id: 'patient',
  lead_id: 'lead',
  lead_read_id: 'leadRead',
  message_template_id: 'messageTemplate',
  appointment_id: 'appointment',
  visit_id: 'visit',
  diagnosis_id: 'diagnosis',
  patient_clinical_note_id: 'patientClinicalNote',
  prescription_id: 'prescription',
  prescription_kit_id: 'prescriptionKit',
  patient_note_id: 'patientNote',
  invoice_id: 'invoice',
  patient_package_id: 'patientPackage',
  offering_suggestion_id: 'offeringSuggestion',
  patient_idea_id: 'patientIdea',
  payment_id: 'payment',
  payment_edit_id: 'paymentEdit',
  credit_note_id: 'creditNote',
  pending_credit_id: 'pendingCredit',
  day_close_id: 'dayClose',
  day_close_event_id: 'dayCloseEvent',
  treatment_id: 'treatment',
  check_in_id: 'checkIn',
  review_id: 'review',
  feedback_action_id: 'feedbackAction',
  manufacturer_id: 'manufacturer',
  supplier_id: 'supplier',
  medical_rep_id: 'medicalRep',
  medical_rep_visit_id: 'medicalRepVisit',
  medicine_id: 'medicine',
  medical_purchase_order_id: 'medicalPurchaseOrder',
  medical_contact_id: 'medicalContact',
  medical_sale_id: 'medicalSale',
  supplier_credit_id: 'supplierCredit',
  stock_vendor_id: 'stockVendor',
  stock_item_id: 'stockItem',
  stock_purchase_id: 'stockPurchase',
  stock_count_id: 'stockCount',
  stock_movement_id: 'stockMovement',
  task_id: 'task',
  task_owner_change_id: 'taskOwnerChange',
  task_rule_setting_id: 'taskRuleSetting',
  patient_image_id: 'patientImage',
  patient_report_id: 'patientReport',
  message_id: 'message',
} as const satisfies Record<string, PublicIdEntity>;

/** Deterministic placeholder id for an entity (valid shape, never a real row). */
export function publicIdPlaceholderFor(entity: PublicIdEntity): string {
  return `${PUBLIC_ID_PREFIXES[entity]}_${'0'.repeat(PUBLIC_ID_LENGTH)}`;
}
