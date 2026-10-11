import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';

/** Rows of a `database.execute()` result. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}

/**
 * Verifies defense-in-depth RLS on system tables (migration 20260520000001).
 */
describe('Security: system tables RLS deny-all', () => {
  beforeAll(async () => {
    const rows = rowsOf<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      await database.execute(sql`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE (n.nspname, c.relname) IN (
        ('billing', 'stripe_webhook_events'),
        ('billing', 'stripe_subscription_tombstones'),
        ('auth', 'mail_outbox')
      )
    `),
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it('defines deny-all and clinozy_be_app policies on stripe_webhook_events', async () => {
    const policies = rowsOf<{ policyname: string }>(
      await database.execute(sql`
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'billing' AND tablename = 'stripe_webhook_events'
    `),
    );
    const names = policies.map((row) => row.policyname);
    expect(names).toContain('stripe_webhook_events_deny_all');
    expect(names).toContain('stripe_webhook_events_app_access');
  });

  it('defines deny-all and clinozy_be_app policies on stripe_subscription_tombstones (BILL-03)', async () => {
    const policies = rowsOf<{ policyname: string }>(
      await database.execute(sql`
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'billing' AND tablename = 'stripe_subscription_tombstones'
    `),
    );
    const names = policies.map((row) => row.policyname);
    expect(names).toContain('stripe_subscription_tombstones_deny_all');
    expect(names).toContain('stripe_subscription_tombstones_app_access');
  });

  it('every role-scoped *_app_access policy names both runtime roles', async () => {
    // The maintenance pool (clinozy_be_maintenance) runs the retention purges and system-table
    // maintenance. A policy naming only clinozy_be_app admits it solely through its role
    // membership (20260827020000) — revoke that grant and the purge silently matches no rows.
    // auth.verification_tokens carried exactly that gap until 20261006022303.
    const policies = rowsOf<{ table_name: string; policyname: string; roles: string[] }>(
      await database.execute(sql`
      SELECT schemaname || '.' || tablename AS table_name, policyname, roles::text[] AS roles
      FROM pg_policies
      WHERE right(policyname, 11) = '_app_access'
      ORDER BY 1, 2
    `),
    );
    // Seven system tables carry the pair today; fewer means a policy was dropped or renamed.
    expect(policies.length).toBeGreaterThanOrEqual(7);
    const runtimeRoles = ['clinozy_be_app', 'clinozy_be_maintenance'];
    const missingARuntimeRole = policies
      .filter((policy) => !runtimeRoles.every((role) => policy.roles.includes(role)))
      .map((policy) => `${policy.table_name} → ${policy.policyname} {${policy.roles.join(',')}}`);
    expect(missingARuntimeRole).toEqual([]);
  });

  it('defines deny-all and clinozy_be_app policies on mail_outbox', async () => {
    const policies = rowsOf<{ policyname: string }>(
      await database.execute(sql`
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'auth' AND tablename = 'mail_outbox'
    `),
    );
    const names = policies.map((row) => row.policyname);
    expect(names).toContain('mail_outbox_deny_all');
    expect(names).toContain('mail_outbox_app_access');
  });
});
