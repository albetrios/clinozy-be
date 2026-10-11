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
function resourceCodes({
  resource,
  actions,
}: {
  resource: string;
  actions: readonly AccessAction[];
}): string[] {
  return actions.map((action) => `${resource}:${action}`);
}

/** The codes of every resource in a section for the given actions. */
function sectionCodes({
  section,
  actions,
}: {
  section: AppAccessSection;
  actions: readonly AccessAction[];
}): string[] {
  return APP_ACCESS_SECTION_RESOURCES[section].flatMap((resource) =>
    resourceCodes({ resource, actions }),
  );
}

/** The read codes of the given resources — the pickers a role needs outside its sections. */
function readCodes(resources: readonly string[]): string[] {
  return resources.map((resource) => `${resource}:read`);
}

/**
 * What every role holds: the organization (the team picker `GET /app/memberships`, the member's
 * own preferences and saved views — launch U2 — and the offering groups, offerings and offers every
 * booking and bill picks from — launch O2) and reading contacts (CT5). The team management list
 * (`membership:read`) is Owner and Admin (T7).
 */
const EVERY_ROLE_CODES: readonly string[] = [
  TENANCY_PERMISSIONS.ORGANIZATION_READ,
  APP_PERMISSIONS.CONTACT_READ,
];

/**
 * The tasks' View · Create · Edit (launch #138, TK2) — the roles that work the to-do list: Doctor,
 * Therapist (the aftercare calls), Front desk and Counsellor.
 */
const TASK_WORKER_CODES: readonly string[] = sectionCodes({
  section: 'tasks',
  actions: VIEW_CREATE_EDIT,
});

/**
 * The tasks' View · Edit without adding any (launch D81 (5)) — the roles whose queue the rules fill:
 * Pharmacist (the medical rep visits, TASKS-M5) and Marketing (the leads' follow-ups). They work the
 * tasks they are given; the Accountant sees no tasks.
 */
const TASK_TAKER_CODES: readonly string[] = sectionCodes({
  section: 'tasks',
  actions: ['read', 'update'],
});

/**
 * Logging, changing and deleting a patient's reviews (launch D83 (4)) — their own codes since the
 * review writes left `patient:update`: every role that changes the patient file holds them (as it did
 * through `patient:update`), and Marketing, which logs reviews without touching the file (D16).
 */
const PATIENT_REVIEW_CODES: readonly string[] = [
  APP_PERMISSIONS.PATIENT_REVIEW_CREATE,
  APP_PERMISSIONS.PATIENT_REVIEW_UPDATE,
  APP_PERMISSIONS.PATIENT_REVIEW_DELETE,
];

/**
 * What every role that deals with people holds — all but the Accountant: {@link EVERY_ROLE_CODES},
 * the contacts' View · Create · Edit (launch #129, CT5) and the activity's (launch #130, M4).
 */
const PERSON_FACING_ROLE_CODES: readonly string[] = [
  ...EVERY_ROLE_CODES,
  ...sectionCodes({ section: 'contacts', actions: VIEW_CREATE_EDIT }),
  ...sectionCodes({ section: 'activity', actions: VIEW_CREATE_EDIT }),
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
  /** The role's colour — the design's role tones (D81 (4)). */
  tone: ChipTone;
  /** A locked role's access cannot be changed (of the presets only Admin, D40; Owner is locked too). */
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
    ...TASK_WORKER_CODES,
    ...sectionCodes({ section: 'leads', actions: VIEW_CREATE_EDIT }),
    ...sectionCodes({ section: 'appointments', actions: VIEW_CREATE_EDIT }),
    ...sectionCodes({ section: 'patients', actions: VIEW_CREATE_EDIT }),
    ...PATIENT_REVIEW_CODES,
    // Picks medicines on prescriptions (launch #153, MD2)
    ...readCodes(['medicine']),
    // Sees the patient's bills and payments in the file (launch D83 (4), QA C3)
    APP_PERMISSIONS.PAYMENT_READ,
    APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
    APP_PERMISSIONS.PATIENT_PRIVATE_ALBUM_READ,
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
  tone: CHIP_TONE.BUTTER,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...TASK_WORKER_CODES,
    ...sectionCodes({ section: 'appointments', actions: VIEW_CREATE_EDIT }),
    ...resourceCodes({ resource: 'patient', actions: VIEW_CREATE_EDIT }),
    ...PATIENT_REVIEW_CODES,
    ...resourceCodes({ resource: 'patient_treatment', actions: VIEW_CREATE_EDIT }),
    ...readCodes(['patient_prescription']),
    ...sectionCodes({ section: 'stock', actions: VIEW_CREATE_EDIT }),
    APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
  ]),
};

/** The Front desk role preset (D12). */
const FRONT_DESK_PRESET: AppRolePreset = {
  name: 'Front desk',
  description: 'Answers leads, books and confirms visits, takes payments.',
  tone: CHIP_TONE.MINT,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...TASK_WORKER_CODES,
    ...sectionCodes({ section: 'leads', actions: VIEW_CREATE_EDIT }),
    ...sectionCodes({ section: 'appointments', actions: VIEW_CREATE_EDIT }),
    ...resourceCodes({ resource: 'patient', actions: VIEW_CREATE_EDIT }),
    ...PATIENT_REVIEW_CODES,
    ...readCodes(['patient_treatment']),
    ...sectionCodes({ section: 'stock', actions: VIEW_CREATE_EDIT }),
    // Takes payments and closes the day it counted (launch D83 (2)); refunds are payment:delete
    ...sectionCodes({ section: 'payments', actions: VIEW_CREATE_EDIT }),
  ]),
};

/** The Counsellor role preset (D12). */
const COUNSELLOR_PRESET: AppRolePreset = {
  name: 'Counsellor',
  description: 'Plans treatments with patients and sells packages.',
  tone: CHIP_TONE.SAGE,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    ...TASK_WORKER_CODES,
    ...sectionCodes({ section: 'leads', actions: VIEW_CREATE_EDIT }),
    ...sectionCodes({ section: 'appointments', actions: VIEW_CREATE_EDIT }),
    ...resourceCodes({ resource: 'patient', actions: VIEW_CREATE_EDIT }),
    ...PATIENT_REVIEW_CODES,
    ...readCodes(['patient_prescription', 'patient_treatment']),
    // Fixes the bills it makes — and so closes the day too (launch D83 (4), QA C7: accepted)
    ...sectionCodes({ section: 'payments', actions: VIEW_CREATE_EDIT }),
    // Groups, offerings — prices included — and offers (O2, O3)
    ...sectionCodes({ section: 'offerings', actions: ['create', 'update'] }),
    APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
  ]),
};

/** The Pharmacist role preset (D12). */
const PHARMACIST_PRESET: AppRolePreset = {
  name: 'Pharmacist',
  description: 'Runs the medical store: medicines, orders and sales.',
  tone: CHIP_TONE.BLUSH,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    // Works the medical rep visits the rules queue for the pharmacist (D81 (5), TASKS-M5)
    ...TASK_TAKER_CODES,
    ...sectionCodes({ section: 'medical', actions: VIEW_CREATE_EDIT }),
    ...readCodes(['patient', 'patient_prescription']),
    // Sees who is at the pharmacy stage of today's visits (launch D83 (4), QA C4)
    ...readCodes(['appointment']),
    // Uses clinic stock in procedures (launch #137, S2)
    ...sectionCodes({ section: 'stock', actions: VIEW_CREATE_EDIT }),
    // Sells and collects, refunds returns, pays suppliers (launch #153, MD2) — and reads the bills
    // and payments it takes (D81 (5), PAY-M3)
    APP_PERMISSIONS.PAYMENT_READ,
    APP_PERMISSIONS.PAYMENT_CREATE,
    APP_PERMISSIONS.PATIENT_EXPORT,
    APP_PERMISSIONS.OFFERING_EXPORT,
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
    ...sectionCodes({ section: 'payments', actions: VIEW_CREATE_EDIT }),
    // Reverses a payment and reopens a day, as the design's (D81 (5), PAY-M2)
    APP_PERMISSIONS.PAYMENT_DELETE,
    // The medical store: view and export only, as the design's access line (launch #153, MD2)
    ...sectionCodes({ section: 'medical', actions: ['read'] }),
    APP_PERMISSIONS.MEDICINE_EXPORT,
    ...sectionCodes({ section: 'stock', actions: ['read'] }),
    APP_PERMISSIONS.STOCK_ITEM_EXPORT,
    APP_PERMISSIONS.PATIENT_EXPORT,
    APP_PERMISSIONS.PAYMENT_EXPORT,
    APP_PERMISSIONS.OFFERING_EXPORT,
    APP_PERMISSIONS.OFFERING_LOWER_PRICE_READ,
  ]),
};

/** The Marketing role preset (D12). */
const MARKETING_PRESET: AppRolePreset = {
  name: 'Marketing',
  description: 'Works leads and campaigns.',
  tone: CHIP_TONE.PLUM,
  isLocked: false,
  permissionCodes: unique([
    ...PERSON_FACING_ROLE_CODES,
    // Works the follow-ups the rules give it (D81 (5))
    ...TASK_TAKER_CODES,
    ...sectionCodes({ section: 'leads', actions: VIEW_CREATE_EDIT }),
    ...readCodes(['patient']),
    // Logs the reviews patients give (D16, launch D83 (4)) — without changing the file
    ...PATIENT_REVIEW_CODES,
  ]),
};

/**
 * The clinic roles seeded into every TEAM organization next to Owner (D12, D13, D15, D16, D18, TK2).
 *
 * @remarks
 * - **Algorithm:** each role holds View · Create · Edit in its sections (D12), the read codes of
 *   the pickers it needs, and its special permissions (D18); only Admin deletes — and the
 *   Accountant, who refunds, reverses a payment and reopens a day (`payment:delete`, D81 (5),
 *   D83 (1)); the review codes, delete included, go to every role that changes the patient file and
 *   to Marketing (D83 (4) — they held them through `patient:update` before). Role-named
 *   actions are codes (D13): prescriptions are written by Doctor, treatments by Doctor and
 *   Therapist. The Accountant sees the patient file's billing only (D15 — the medical details are
 *   hidden from it, D83 (3)); Marketing logs reviews only (D16, its review codes D83 (4)); the Doctor
 *   reads payments, the Pharmacist the appointments, the Counsellor edits bills (D83 (4)); Pharmacist and Marketing work the tasks they are given without adding any
 *   (D81 (5)); the task rules are an organization setting — Owner and Admin (TK2). Each role's
 *   tone is the design's (D81 (4)).
 * - **Notes:** Admin is everything Owner holds in the app and the team, minus deleting the
 *   organization (D8), and is the one locked preset (the Owner role, provisioned beside them, is
 *   locked too). Every other role is a system role (its name is fixed, it cannot be deleted)
 *   whose access each organization edits.
 */
export function appRolePresets(adminCodes: readonly string[]): readonly AppRolePreset[] {
  return [
    {
      name: 'Admin',
      description: 'Runs the organization: every section, settings, team and roles.',
      tone: CHIP_TONE.LAVENDER,
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
