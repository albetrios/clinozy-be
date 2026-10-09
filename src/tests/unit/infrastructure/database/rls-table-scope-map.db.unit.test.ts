import { describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import {
  MAINTENANCE_CONTEXTS,
  SESSION_CONTEXTS,
} from '@/infrastructure/database/contexts/database-context.js';
import { EXPECTED_FORCE_RLS_TABLES } from '@/infrastructure/database/utils/force-rls-tables.constants.js';
import { DATABASE_MAINTENANCE_ROLE } from '@/shared/constants/project-identity.constants.js';

/**
 * Phase 8 — the table→required-scope map. For every FORCE-RLS table this pins
 * EXACTLY which `app.*` GUCs its live policies reference, i.e. which scope
 * patterns can ever grant access to it. A migration that adds, drops, or
 * retargets a policy arm must update this map deliberately — silent policy
 * weakening (a new bypass GUC on a tenant table) or dead arms (a GUC no code
 * sets) can no longer slip through.
 *
 * Sources of truth:
 * - the LIVE database (`pg_policies.qual` / `with_check`) — final post-migration
 *   state, robust to later migrations replacing earlier policies;
 * - the scope registries in `database-context.ts` — the only legal GUC universe.
 *
 * Every maintenance (bypass) GUC arm is also pinned to the maintenance role: the arm opens only
 * while `current_user` is the role `DATABASE_MAINTENANCE_URL` connects as
 * (migration 20261005170000_bind_bypass_arms_to_maintenance_role.sql).
 */
const RLS_TABLE_SCOPE_MAP: Record<string, readonly string[]> = {
  // Tables whose policies carry no app.* GUC (application-access or claim-based
  // system tables kept under FORCE RLS for the owner-role discipline).
  'audit.dead_letter_jobs': [],
  'auth.mail_outbox': [],
  'auth.verification_tokens': [],
  'billing.plans': [],
  'billing.stripe_subscription_tombstones': [],
  'billing.stripe_webhook_events': [],
  'tenancy.permissions': [],

  'audit.logs': [
    'app.current_organization_public_id',
    'app.current_user_public_id',
    'app.global_admin',
    'app.global_retention_cleanup',
    'app.system_audit_insert',
  ],
  'audit.outbox': [
    'app.audit_outbox_drain',
    'app.current_organization_public_id',
    'app.system_audit_insert',
  ],
  'auth.auth_methods': ['app.current_user_public_id', 'app.global_admin'],
  'auth.mfa_methods': ['app.current_user_public_id'],
  'auth.mfa_recovery_codes': ['app.current_user_public_id'],
  'auth.sessions': [
    'app.current_session_public_id',
    'app.current_session_token_hash',
    'app.current_user_public_id',
    'app.session_retention_cleanup',
  ],
  'auth.user_data_exports': ['app.current_user_public_id', 'app.global_retention_cleanup'],
  'auth.user_notification_preferences': ['app.current_user_public_id'],
  'auth.user_settings': ['app.current_user_public_id'],
  'auth.users': ['app.current_user_public_id', 'app.global_admin', 'app.global_retention_cleanup'],
  'auth.webauthn_credentials': ['app.current_user_public_id'],
  'billing.subscriptions': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'notify.notifications': [
    'app.current_organization_public_id',
    'app.current_user_public_id',
    'app.global_retention_cleanup',
  ],
  'notify.webhook_delivery_attempts': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'notify.webhooks': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'tenancy.api_keys': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  // A member's roles besides the main one (launch D5) — organization-scoped, no soft delete.
  'tenancy.membership_additional_roles': ['app.current_organization_public_id'],
  'tenancy.membership_invitations': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'tenancy.memberships': [
    'app.current_organization_public_id',
    'app.current_user_public_id',
    'app.global_retention_cleanup',
  ],
  'tenancy.organization_notification_policies': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'tenancy.organization_settings': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'tenancy.organizations': [
    'app.current_organization_public_id',
    'app.current_user_public_id',
    'app.global_retention_cleanup',
  ],
  'tenancy.role_permissions': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'tenancy.roles': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'upload.uploads': [
    'app.current_organization_public_id',
    'app.current_user_public_id',
    'app.global_retention_cleanup',
  ],
  // The app's records (launch ROUTE #125–#153): every table is organization-scoped; a table
  // with soft-deleted rows also opens to the maintenance purge (WC-46).
  'app.appointments': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.branch_holidays': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.branch_machines': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.branch_members': ['app.current_organization_public_id'],
  'app.branch_rooms': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.branches': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.contact_activities': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.contact_members': ['app.current_organization_public_id'],
  'app.contact_message_templates': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'app.contact_phones': ['app.current_organization_public_id'],
  'app.contacts': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.day_close_events': ['app.current_organization_public_id'],
  'app.day_closes': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.invoice_credit_notes': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'app.invoice_items': ['app.current_organization_public_id'],
  'app.invoice_members': ['app.current_organization_public_id'],
  'app.invoices': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.lead_involved_memberships': ['app.current_organization_public_id'],
  'app.leads': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.manufacturers': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.medical_purchase_order_items': ['app.current_organization_public_id'],
  'app.medical_purchase_orders': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'app.medical_rep_manufacturers': ['app.current_organization_public_id'],
  'app.medical_rep_visits': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.medical_reps': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.medical_sale_return_items': ['app.current_organization_public_id'],
  'app.medical_sale_returns': ['app.current_organization_public_id'],
  'app.medical_sales': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.medicine_batches': ['app.current_organization_public_id'],
  'app.medicine_supplier_prices': ['app.current_organization_public_id'],
  'app.medicines': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.membership_preference_branches': ['app.current_organization_public_id'],
  'app.membership_preferences': ['app.current_organization_public_id'],
  'app.membership_saved_views': ['app.current_organization_public_id'],
  'app.messaging_webhook_events': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'app.offer_branches': ['app.current_organization_public_id'],
  'app.offer_offerings': ['app.current_organization_public_id'],
  'app.offering_branches': ['app.current_organization_public_id'],
  'app.offering_groups': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.offerings': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.offers': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.patient_check_ins': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.patient_clinical_notes': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'app.patient_diagnoses': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.patient_feedback_actions': ['app.current_organization_public_id'],
  'app.patient_images': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.patient_offering_suggestions': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'app.patient_offerings': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.patient_prescriptions': [
    'app.current_organization_public_id',
    'app.global_retention_cleanup',
  ],
  'app.patient_reports': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.patient_reviews': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.patient_treatments': ['app.current_organization_public_id'],
  'app.patients': ['app.current_organization_public_id'],
  'app.payment_edits': ['app.current_organization_public_id'],
  'app.payments': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.pending_credits': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.prescription_kits': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.record_counters': ['app.current_organization_public_id'],
  'app.stock_count_lines': ['app.current_organization_public_id'],
  'app.stock_counts': ['app.current_organization_public_id'],
  'app.stock_item_movements': ['app.current_organization_public_id'],
  'app.stock_items': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.stock_purchase_items': ['app.current_organization_public_id'],
  'app.stock_purchases': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.stock_vendors': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.supplier_credits': ['app.current_organization_public_id'],
  'app.supplier_manufacturers': ['app.current_organization_public_id'],
  'app.suppliers': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
  'app.task_owner_changes': ['app.current_organization_public_id'],
  'app.task_rule_settings': ['app.current_organization_public_id'],
  'app.tasks': ['app.current_organization_public_id', 'app.global_retention_cleanup'],
};

/**
 * One bypass arm as `pg_policies` prints it once bound to the maintenance role — the shape the
 * binding migration writes and `maintenanceBypassArm` declares in the Drizzle schemas.
 */
function boundBypassArm(guc: string): string {
  return (
    `(( SELECT current_setting('${guc}'::text, true) AS current_setting) = 'true'::text) AND ` +
    `(( SELECT CURRENT_USER AS "current_user") = '${DATABASE_MAINTENANCE_ROLE}'::name)`
  );
}

/** Identity GUCs set by the principal pattern (`buildIdentityGucStatement`). */
const PRINCIPAL_GUCS = ['app.current_organization_public_id', 'app.current_user_public_id'];

/**
 * GUCs a policy arm references but NO code path sets — every entry here is a
 * dead arm scheduled for removal by a migration. Shrink-only; currently empty
 * (the app.current_session_refresh_token_hash arm was dropped by the
 * rls_policy_initplan_hygiene migration).
 */
const KNOWN_DEAD_POLICY_GUCS = new Set<string>([]);

describe('RLS table → required-scope map (Phase 8)', () => {
  it('live pg_policies GUC references match the map exactly, table by table', async () => {
    const rows = await database.execute<{ table_key: string; gucs: string | null }>(
      drizzleSql`
        SELECT x.schemaname || '.' || x.tablename AS table_key,
               string_agg(DISTINCT x.guc, ',' ORDER BY x.guc) AS gucs
        FROM (
          SELECT p.schemaname, p.tablename, m[1] AS guc
          FROM pg_policies p,
          LATERAL regexp_matches(
            COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, ''),
            'app\\.[a-z_]+',
            'g'
          ) m
        ) x
        GROUP BY x.schemaname, x.tablename
      `,
    );
    const resultRows = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: { table_key: string; gucs: string | null }[] }).rows ?? []);
    const live = new Map(resultRows.map((row) => [row.table_key, row.gucs ?? '']));

    const actual: Record<string, readonly string[]> = {};
    for (const table of EXPECTED_FORCE_RLS_TABLES) {
      const key = `${table.schemaName}.${table.tableName}`;
      const gucs = live.get(key);
      actual[key] = gucs === undefined || gucs === '' ? [] : gucs.split(',');
    }

    expect(actual).toEqual(RLS_TABLE_SCOPE_MAP);
  });

  it('every bypass GUC arm also requires the maintenance role', async () => {
    const bypassGucs = Object.values(MAINTENANCE_CONTEXTS).flatMap((definition) =>
      definition.guc === null ? [] : [definition.guc],
    );
    const rows = await database.execute<{ policy: string; expression: string }>(
      drizzleSql`
        SELECT schemaname || '.' || tablename || ' ' || policyname AS policy,
               COALESCE(qual, '') || ' ' || COALESCE(with_check, '') AS expression
        FROM pg_policies
      `,
    );
    const resultRows = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: { policy: string; expression: string }[] }).rows ?? []);

    let boundArmCount = 0;
    const unboundArms: string[] = [];
    for (const row of resultRows) {
      let remaining = row.expression;
      for (const guc of bypassGucs) {
        const parts = remaining.split(boundBypassArm(guc));
        boundArmCount += parts.length - 1;
        remaining = parts.join('');
      }
      for (const guc of bypassGucs) {
        if (remaining.includes(`'${guc}'`)) unboundArms.push(`${row.policy}: ${guc}`);
      }
    }

    expect(boundArmCount).toBeGreaterThan(0);
    expect(
      unboundArms,
      'A bypass arm that any role can open — bind it to the maintenance role the way ' +
        'migration 20261005170000 does (maintenanceBypassArm in the Drizzle schema).',
    ).toEqual([]);
  });

  it('the map covers exactly the FORCE-RLS table set', () => {
    const expected = EXPECTED_FORCE_RLS_TABLES.map(
      (table) => `${table.schemaName}.${table.tableName}`,
    ).sort();
    expect(Object.keys(RLS_TABLE_SCOPE_MAP).sort()).toEqual(expected);
  });

  it('every mapped GUC is registry-known (or a documented dead arm)', () => {
    const legal = new Set<string>(PRINCIPAL_GUCS);
    for (const definition of Object.values(SESSION_CONTEXTS)) {
      legal.add(definition.guc);
    }
    for (const definition of Object.values(MAINTENANCE_CONTEXTS)) {
      if (definition.guc !== null) {
        legal.add(definition.guc);
      }
    }

    const unknown = Object.values(RLS_TABLE_SCOPE_MAP)
      .flat()
      .filter((guc) => !(legal.has(guc) || KNOWN_DEAD_POLICY_GUCS.has(guc)));
    expect(
      unknown,
      `Policy GUC(s) with no registry entry and no dead-arm note: ${unknown.join(', ')}. ` +
        'A policy arm must be armed by a scope-registry kind — or explicitly listed as dead.',
    ).toEqual([]);
  });
});
