import { describe, expect, it } from 'vitest';
import { appRolePresets } from '@/domains/app/app-role-presets.js';
import { SYSTEM_PERMISSIONS } from '@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js';
import { CHIP_TONE } from '@/shared/constants/record-fields.constants.js';

/** The preset roles every TEAM organization starts with, Admin's own list aside. */
const PRESETS = appRolePresets([]).filter((preset) => preset.name !== 'Admin');

/** The roles holding `code` by default, by name, sorted. */
function holders(code: string): string[] {
  return PRESETS.filter((preset) => preset.permissionCodes.includes(code))
    .map((preset) => preset.name)
    .sort();
}

/**
 * The sensitive codes and the preset roles that hold them by default (D12, D13, D15, D16, D18; P14
 * the clinical record, P23 the private album). A preset edit that grants one of them to another
 * role fails here until this list is updated on purpose — the clinical gates cannot open by
 * accident (task PT1, docs/reviews/launch-confidence-plan-2026-10-09.md).
 */
const SENSITIVE_HOLDERS: Readonly<Record<string, readonly string[]>> = {
  'patient:clinical_record:read': ['Counsellor', 'Doctor', 'Therapist'],
  'patient:private_album:read': ['Doctor'],
  'patient_prescription:create': ['Doctor'],
  'patient_prescription:update': ['Doctor'],
  'patient_treatment:create': ['Doctor', 'Therapist'],
  'patient_treatment:update': ['Doctor', 'Therapist'],
  'patient:update': ['Counsellor', 'Doctor', 'Front desk', 'Therapist'],
  'patient:export': ['Accountant', 'Doctor', 'Pharmacist'],
  'payment:read': ['Accountant', 'Counsellor', 'Front desk', 'Pharmacist'],
  'payment:create': ['Accountant', 'Counsellor', 'Front desk', 'Pharmacist'],
  'payment:update': ['Accountant', 'Front desk'],
  // Reverse a payment, reopen a day — the Accountant's (D81 (5), PAY-M2).
  'payment:delete': ['Accountant'],
  'offering:lower_price:read': ['Accountant'],
  // Pharmacist and Marketing work the tasks they are given; they add none (D81 (5), TASKS-M5).
  'task:read': ['Counsellor', 'Doctor', 'Front desk', 'Marketing', 'Pharmacist', 'Therapist'],
  'task:create': ['Counsellor', 'Doctor', 'Front desk', 'Therapist'],
  'task:update': ['Counsellor', 'Doctor', 'Front desk', 'Marketing', 'Pharmacist', 'Therapist'],
};

/**
 * Each preset's colour — the design's role tones (D81 (4); clinozy-fe `ROLE_TONES`). Owner's slate
 * is set where the Owner role is provisioned.
 */
const PRESET_TONES: Readonly<Record<string, string>> = {
  Admin: CHIP_TONE.LAVENDER,
  Doctor: CHIP_TONE.SKY,
  Therapist: CHIP_TONE.BUTTER,
  'Front desk': CHIP_TONE.MINT,
  Counsellor: CHIP_TONE.SAGE,
  Pharmacist: CHIP_TONE.BLUSH,
  Accountant: CHIP_TONE.PEACH,
  Marketing: CHIP_TONE.PLUM,
};

describe('app role presets — the sensitive codes (policy)', () => {
  it.each(Object.entries(SENSITIVE_HOLDERS))(
    '%s is held by exactly the expected roles',
    (code, expected) => {
      expect(holders(code)).toEqual([...expected].sort());
    },
  );

  it("gives no preset role a delete but the Accountant's payment:delete — Owner and Admin delete (D12, D81 (5))", () => {
    const deleters = PRESETS.flatMap((preset) =>
      preset.permissionCodes
        .filter((code) => code.endsWith(':delete'))
        .map((code) => `${preset.name} ${code}`),
    );
    expect(deleters).toEqual(['Accountant payment:delete']);
  });

  it("gives each preset the design's tone (D81 (4))", () => {
    expect(
      Object.fromEntries(appRolePresets([]).map((preset) => [preset.name, preset.tone])),
    ).toEqual(PRESET_TONES);
  });

  it('keeps team, role and organization management with Owner and Admin (T7, D8)', () => {
    const managers = PRESETS.flatMap((preset) =>
      preset.permissionCodes
        .filter((code) => /^(membership|role|organization):(create|update|delete)$/.test(code))
        .map((code) => `${preset.name} ${code}`),
    );
    expect(managers).toEqual([]);
  });

  it('grants only codes the permission catalog knows', () => {
    const catalog = new Set<string>(SYSTEM_PERMISSIONS.map((permission) => permission.code));
    const unknown = PRESETS.flatMap((preset) =>
      preset.permissionCodes
        .filter((code) => !catalog.has(code))
        .map((code) => `${preset.name} ${code}`),
    );
    expect(unknown).toEqual([]);
  });

  it('locks only Admin of the presets (D40) — the Owner role is locked where it is provisioned', () => {
    expect(
      appRolePresets([])
        .filter((preset) => preset.isLocked)
        .map((preset) => preset.name),
    ).toEqual(['Admin']);
  });
});
