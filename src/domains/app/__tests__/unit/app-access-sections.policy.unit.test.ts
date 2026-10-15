import { describe, expect, it } from 'vitest';
import {
  APP_ACCESS_SECTION_RESOURCES,
  APP_MATRIX_SECTIONS,
} from '@/domains/app/app-access-sections.js';
import { MEMBERSHIP_PREFERENCE_DEFAULTS } from '@/domains/app/sub-domains/memberships/membership-preferences/membership-preferences.constants.js';
import { SYSTEM_PERMISSIONS } from '@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js';

/** The section each resource's codes belong to, from the one map. */
const SECTION_BY_RESOURCE: ReadonlyMap<string, string> = new Map(
  Object.entries(APP_ACCESS_SECTION_RESOURCES).flatMap(([section, resources]) =>
    resources.map((resource): [string, string] => [resource, section]),
  ),
);

describe('app access sections', () => {
  it('lists every section of the map as a Roles matrix row, once', () => {
    expect([...APP_MATRIX_SECTIONS].sort()).toEqual(
      Object.keys(APP_ACCESS_SECTION_RESOURCES).sort(),
    );
  });

  it("files every code of a section's resource under that section in the catalog", () => {
    const misfiled = SYSTEM_PERMISSIONS.flatMap(({ code, category }) => {
      const resource = code.split(':')[0] ?? '';
      const section = SECTION_BY_RESOURCE.get(resource);
      return section !== undefined && section !== category
        ? [`${code}: ${category} (expected ${section})`]
        : [];
    });
    expect(misfiled).toEqual([]);
  });

  it('gives Branches its own row and pins it by default (change-branches-in-navbar)', () => {
    expect(APP_ACCESS_SECTION_RESOURCES.branches).toEqual(['branch']);
    expect(APP_ACCESS_SECTION_RESOURCES.users).not.toContain('branch');
    expect(MEMBERSHIP_PREFERENCE_DEFAULTS.pinned_sections).toContain('branches');
  });
});
