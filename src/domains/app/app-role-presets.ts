import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import {
  APP_ACCESS_SECTION_RESOURCES,
  type AppAccessSection,
} from '@/domains/app/app-access-sections.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { CHIP_TONE, type ChipTone } from '@/shared/constants/record-fields.constants.js';

/** A table action a matrix checkbox grants — `read` is the matrix's View, `update` its Edit. */
type AccessAction = 'read' | 'create' | 'update' | 'delete';

/** View · Create · Edit — what each role gets in its sections (D12; only Owner and Admin delete). */
const VIEW_CREATE_EDIT: readonly AccessAction[] = ['read', 'create', 'update'];

/** The codes of one resource for the given actions (`patient` → `patient:read`, …). */
function resourceCodes(resource: string, actions: readonly AccessAction[]): string[] {
  return actions.map((action) => `${resource}:${action}`);
}

/** The codes of every resource in a section for the given actions. */
function sectionCodes(section: AppAccessSection, actions: readonly AccessAction[]): string[] {
  return APP_ACCESS_SECTION_RESOURCES[section].flatMap((resource) =>
    resourceCodes(resource, actions),
  );
}

/** The read codes of the given resources — the pickers a role needs outside its sections. */
function readCodes(resources: readonly string[]): string[] {
  return resources.map((resource) => `${resource}:read`);
}

/**
 * What every role holds: the organization (the team picker `GET /app/memberships`, the member's
 * own preferences and saved views — launch U2 — and the offering groups, offerings and offers every
 * booking and bill picks from — launch O2), tasks (D12) and reading contacts (CT5). The team management list
 * (`membership:read`) is Owner and Admin (T7).
 */
const EVERY_ROLE_CODES: readonly string[] = [
  TENANCY_PERMISSIONS.ORGANIZATION_READ,
  ...sectionCodes('tasks', VIEW_CREATE_EDIT),
  APP_PERMISSIONS.CONTACT_READ,
];

/**
 * What every role that deals with people holds — all but the Accountant: {@link EVERY_ROLE_CODES},
 * the contacts' View · Create · Edit (launch #129, CT5) and the activity's (launch #130, M4).
 */
const PERSON_FACING_ROLE_CODES: readonly string[] = [
  ...EVERY_ROLE_CODES,
  ...sectionCodes('contacts', VIEW_CREATE_EDIT),
  ...sectionCodes('activity', VIEW_CREATE_EDIT),
];

/**
 * One default clinic role provisioned into every TEAM organization (launch ROUTE #6/#7).
 *
 * @remarks
 * - **Notes:** `permissionCodes` holds no duplicates (the grant table is keyed on role and code);
 *   every code exists in the permission catalog.
 */
export interface AppRolePreset {
  /** Role name; unique within the organization, fixed for a system role. */
  name: string;
  /** Purpose line shown under the name (Users › Roles). */
  description: string;
  /** The role's colour. */
  tone: ChipTone;
  /** A locked role's access cannot be changed (only Admin, D40). */
  isLocked: boolean;
  /** The permission codes granted at provisioning — each organization edits them after (D5). */
  permissionCodes: readonly string[];
}

/** De-duplicates a preset's codes, keeping their first order. */
function unique(codes: readonly string[]): readonly string[] {
  return [...new Set(codes)];
}

/** The Doctor role preset (D12). */
const DOCTOR_PRESET: AppRolePreset = {
  name: 'Doctor',
  description: 'Sees patients, writes prescriptions and records treatments.',
  tone: CHIP_TONE.SKY,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...sectionCodes('leads', VIEW_CREATE_EDIT),
    ...sectionCodes('appointments', VIEW_CREATE_EDIT),
    ...sectionCodes('patients', VIEW_CREATE_EDIT),
    ...readCodes(['medicine', 'manufacturer']),
    APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
    APP_PERMISSIONS.PATIENT_PRIVATE_ALBUM_READ,
    APP_PERMISSIONS.LIST_EXPORT,
    APP_PERMISSIONS.OFFERING_EXPORT,
    APP_PERMISSIONS.LEAD_EXPORT,
    APP_PERMISSIONS.APPOINTMENT_EXPORT,
    APP_PERMISSIONS.PATIENT_EXPORT,
  ]),
};

/** The Therapist role preset (D12). */
const THERAPIST_PRESET: AppRolePreset = {
  name: 'Therapist',
  description: 'Runs treatment sessions and uses clinic stock.',
  tone: CHIP_TONE.MINT,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...sectionCodes('appointments', VIEW_CREATE_EDIT),
    ...resourceCodes('patient', VIEW_CREATE_EDIT),
    ...resourceCodes('patient_treatment', VIEW_CREATE_EDIT),
    ...readCodes(['patient_prescription']),
    ...sectionCodes('stock', VIEW_CREATE_EDIT),
    APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
  ]),
};

/** The Front desk role preset (D12). */
const FRONT_DESK_PRESET: AppRolePreset = {
  name: 'Front desk',
  description: 'Answers leads, books and confirms visits, takes payments.',
  tone: CHIP_TONE.BUTTER,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...sectionCodes('leads', VIEW_CREATE_EDIT),
    ...sectionCodes('appointments', VIEW_CREATE_EDIT),
    ...resourceCodes('patient', VIEW_CREATE_EDIT),
    ...readCodes(['patient_treatment']),
    ...sectionCodes('stock', VIEW_CREATE_EDIT),
    ...sectionCodes('payments', VIEW_CREATE_EDIT),
  ]),
};

/** The Counsellor role preset (D12). */
const COUNSELLOR_PRESET: AppRolePreset = {
  name: 'Counsellor',
  description: 'Plans treatments with patients and sells packages.',
  tone: CHIP_TONE.LAVENDER,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...sectionCodes('leads', VIEW_CREATE_EDIT),
    ...sectionCodes('appointments', VIEW_CREATE_EDIT),
    ...resourceCodes('patient', VIEW_CREATE_EDIT),
    ...readCodes(['patient_prescription', 'patient_treatment']),
    ...sectionCodes('payments', ['read', 'create']),
    // Groups, offerings — prices included — and offers (O2, O3)
    ...sectionCodes('offerings', ['create', 'update']),
    APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
  ]),
};

/** The Pharmacist role preset (D12). */
const PHARMACIST_PRESET: AppRolePreset = {
  name: 'Pharmacist',
  description: 'Runs the medical store: medicines, orders and sales.',
  tone: CHIP_TONE.SAGE,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...sectionCodes('medical', VIEW_CREATE_EDIT),
    ...readCodes(['patient', 'patient_prescription']),
    // Uses clinic stock in procedures (launch #137, S2)
    ...sectionCodes('stock', VIEW_CREATE_EDIT),
    APP_PERMISSIONS.LIST_EXPORT,
    APP_PERMISSIONS.PATIENT_EXPORT,
    APP_PERMISSIONS.OFFERING_EXPORT,
    APP_PERMISSIONS.SALE_VOID,
  ]),
};

/** The Accountant role preset (D12). */
const ACCOUNTANT_PRESET: AppRolePreset = {
  name: 'Accountant',
  description: 'Reconciles payments, closes the day and checks the books.',
  tone: CHIP_TONE.PEACH,
  isLocked: false,
  permissionCodes: unique([
    ...EVERY_ROLE_CODES,
    ...readCodes(['patient']),
    ...sectionCodes('payments', VIEW_CREATE_EDIT),
    ...sectionCodes('medical', VIEW_CREATE_EDIT),
    ...sectionCodes('stock', ['read']),
    APP_PERMISSIONS.STOCK_ITEM_EXPORT,
    APP_PERMISSIONS.PATIENT_EXPORT,
    APP_PERMISSIONS.PAYMENT_EXPORT,
    APP_PERMISSIONS.LIST_EXPORT,
    APP_PERMISSIONS.OFFERING_EXPORT,
    APP_PERMISSIONS.OFFERING_LOWER_PRICE_READ,
  ]),
};

/** The Marketing role preset (D12). */
const MARKETING_PRESET: AppRolePreset = {
  name: 'Marketing',
  description: 'Works leads and campaigns.',
  tone: CHIP_TONE.BLUSH,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...sectionCodes('leads', VIEW_CREATE_EDIT),
    ...readCodes(['patient']),
  ]),
};

/**
 * The clinic roles seeded into every TEAM organization next to Owner (D12, D13, D15, D16, D18, D19).
 *
 * @remarks
 * - **Algorithm:** each role holds View · Create · Edit in its sections (D12), the read codes of
 *   the pickers it needs, and its special permissions (D18); only Admin deletes. Role-named
 *   actions are codes (D13): prescriptions are written by Doctor, treatments by Doctor and
 *   Therapist. The Accountant sees the patient file's billing only (D15); Marketing logs reviews
 *   only (D16); task rules are Owner and Admin (D19).
 * - **Notes:** Admin is everything Owner holds in the app and the team, minus deleting the
 *   organization (D8), and is the one locked role. Every other role is a system role (its name
 *   is fixed, it cannot be deleted) whose access each organization edits.
 */
export function appRolePresets(adminCodes: readonly string[]): readonly AppRolePreset[] {
  return [
    {
      name: 'Admin',
      description: 'Runs the organization: every section, settings, team and roles.',
      tone: CHIP_TONE.SLATE,
      isLocked: true,
      permissionCodes: unique(adminCodes),
    },
    DOCTOR_PRESET,
    THERAPIST_PRESET,
    FRONT_DESK_PRESET,
    COUNSELLOR_PRESET,
    PHARMACIST_PRESET,
    ACCOUNTANT_PRESET,
    MARKETING_PRESET,
  ];
}
