import { describe, expect, it } from 'vitest';
import {
  isUnkeyedRowStatement,
  normalizeStatement,
  organizationContextChange,
  statementFingerprint,
  tablesNamed,
} from '@/tests/helpers/organization-filter-audit.js';
import { RLS_ONLY_STATEMENTS } from '@/tests/helpers/organization-filter-audit.allowlist.js';

describe('organization filter audit', () => {
  it('enters an organization when a statement pins one, and leaves it at the end of the transaction', () => {
    const change = (text: string, values: unknown[] = []) =>
      organizationContextChange({ text, values });
    expect(
      change(
        "SELECT set_config('app.current_user_public_id', $1, true), set_config('app.current_organization_public_id', $2, true)",
        ['usr_a', 'org_a'],
      ),
    ).toBe('enter');
    expect(
      change('SELECT set_config($1, $2, true)', ['app.current_organization_public_id', 'org_a']),
    ).toBe('enter');
    expect(
      change('SELECT set_config($1, $2, true)', ['app.current_organization_public_id', '']),
    ).toBe('leave');
    expect(change('SELECT set_config($1, $2, true)', ['app.audit_outbox_drain', 'true'])).toBe(
      'leave',
    );
    expect(change('commit')).toBe('leave');
    expect(change('ROLLBACK')).toBe('leave');
    expect(change('SELECT set_config($1, $2, true)', ['app.current_user_public_id', 'usr_a'])).toBe(
      'none',
    );
    expect(change('select 1')).toBe('none');
  });

  it('counts a statement keyed by the organization or an internal id, never by a public id alone', () => {
    // The planted-bug drill's leaks (A3-2, A3-10): each lost its organization_id comparison.
    expect(
      isUnkeyedRowStatement(
        'select "id" from "tenancy"."memberships" where ("tenancy"."memberships"."organization_id" = $1 and "tenancy"."memberships"."deleted_at" is null)',
      ),
    ).toBe(false);
    expect(
      isUnkeyedRowStatement(
        'select "id" from "tenancy"."memberships" where "tenancy"."memberships"."deleted_at" is null',
      ),
    ).toBe(true);
    expect(
      isUnkeyedRowStatement(
        'select "id" from "app"."tasks" where ("app"."tasks"."public_id" = $1 and "app"."tasks"."deleted_at" is null)',
      ),
    ).toBe(true);
    expect(
      isUnkeyedRowStatement(
        'select "id", "public_id" from "app"."contacts" where "app"."contacts"."id" in ($1, $2)',
      ),
    ).toBe(false);
    expect(
      isUnkeyedRowStatement(
        'delete from "app"."contact_phones" where "app"."contact_phones"."contact_id" = $1',
      ),
    ).toBe(false);
    expect(isUnkeyedRowStatement('SELECT id FROM app.tasks WHERE organization_id = ANY($1)')).toBe(
      false,
    );
    expect(
      isUnkeyedRowStatement(
        'select "a"."id" from "app"."patients" "a" inner join "app"."contacts" on "app"."contacts"."id" = "a"."contact_id"',
      ),
    ).toBe(true);
    expect(isUnkeyedRowStatement('insert into "app"."tasks" ("name") values ($1)')).toBe(false);
  });

  it('fingerprints a statement the same way whatever its parameter numbers and list lengths', () => {
    const one =
      'select "id" from "app"."offerings"\n  where "app"."offerings"."public_id" in ($1, $2)';
    const other = 'select "id" from "app"."offerings" where "app"."offerings"."public_id" in ($4)';
    expect(normalizeStatement(one)).toBe(
      'select "id" from "app"."offerings" where "app"."offerings"."public_id" in ($..)',
    );
    expect(statementFingerprint(one)).toBe(statementFingerprint(other));
    expect(statementFingerprint(one)).toMatch(/^[0-9a-f]{12}$/);
    expect(statementFingerprint(one)).not.toBe(
      statementFingerprint('select "id" from "app"."offerings"'),
    );
  });

  it('names every table a statement reads or changes, quoted or not', () => {
    expect(
      [
        ...tablesNamed(
          'select "app"."contacts"."id" from "app"."patients" inner join "app"."contacts" on "app"."contacts"."id" = "app"."patients"."contact_id"',
        ),
      ].sort(),
    ).toEqual(['app.contacts', 'app.patients']);
    expect([...tablesNamed('UPDATE billing.subscriptions SET status = $1 WHERE id = $2')]).toEqual([
      'billing.subscriptions',
    ]);
  });

  it('gives every RLS-only statement on the list its reason', () => {
    for (const [fingerprint, reason] of Object.entries(RLS_ONLY_STATEMENTS)) {
      expect(fingerprint).toMatch(/^[0-9a-f]{12}$/);
      expect(reason.length, fingerprint).toBeGreaterThan(20);
    }
  });
});
