import { describe, expect, it } from 'vitest';
import { appRolePresets } from '@/domains/app/app-role-presets.js';
import { SYSTEM_PERMISSIONS } from '@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js';

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
  'payment:create': ['Accountant', 'Counsellor', 'Front desk', 'Pharmacist'],
  'payment:update': ['Accountant', 'Front desk'],
  'offering:lower_price:read': ['Accountant'],
};

describe('app role presets — the sensitive codes (policy)', () => {
  it.each(Object.entries(SENSITIVE_HOLDERS))(
    '%s is held by exactly the expected roles',
    (code, expected) => {
      expect(holders(code)).toEqual([...expected].sort());
    },
  );

  it('gives no preset role a delete — only Owner and Admin delete (D12)', () => {
    const deleters = PRESETS.flatMap((preset) =>
      preset.permissionCodes
        .filter((code) => code.endsWith(':delete'))
        .map((code) => `${preset.name} ${code}`),
    );
    expect(deleters).toEqual([]);
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

  it('locks only Admin (D40)', () => {
    expect(
      appRolePresets([])
        .filter((preset) => preset.isLocked)
        .map((preset) => preset.name),
    ).toEqual(['Admin']);
  });
});
