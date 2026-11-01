import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createAppFixture,
  type AppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { seedAppRecordOfEveryKind } from '@/domains/app/__tests__/factories/app-records.factory.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { operatorQuery, withOperatorTransaction } from '@/tests/helpers/operator-database.js';

/**
 * B2-5: a clinic record cannot point at another clinic's record.
 *
 * Each foreign key below was a single column (`<child>.<column>` -> `<parent>.id`), so a row of one
 * clinic could name the row of another. It is now the composite key
 * `(organization_id, <column>) -> <parent> (organization_id, id)` — see
 * `20261101101100_tenant_composite_foreign_keys.sql`. The catalog test pins each constraint; the
 * behaviour test points a row of one clinic at the matching record of a second clinic and expects that
 * exact constraint to refuse it, for every converted link. Under the old single-column keys the same
 * update succeeds, since the record it names exists.
 */
type DeleteAction = 'cascade' | 'restrict' | 'set null';

type Conversion = {
  /** Schema-qualified child table. */
  table: string;
  column: string;
  /** Schema-qualified parent table. */
  parent: string;
  constraint: string;
  onDelete: DeleteAction;
};

function link(
  table: string,
  column: string,
  parent: string,
  onDelete: DeleteAction,
  constraint: string,
): Conversion {
  return { table, column, parent, constraint, onDelete };
}

const CONVERSIONS: readonly Conversion[] = [
  link('tenancy.memberships', 'role_id', 'tenancy.roles', 'restrict', 'memberships_role_fk'),
  link(
    'tenancy.membership_additional_roles',
    'membership_id',
    'tenancy.memberships',
    'cascade',
    'membership_additional_roles_membership_fk',
  ),
  link(
    'tenancy.membership_additional_roles',
    'role_id',
    'tenancy.roles',
    'cascade',
    'membership_additional_roles_role_fk',
  ),
  link('app.patients', 'contact_id', 'app.contacts', 'restrict', 'patients_contact_fk'),
  link('app.patients', 'home_branch_id', 'app.branches', 'restrict', 'patients_home_branch_fk'),
  link('app.patients', 'lead_id', 'app.leads', 'set null', 'patients_lead_fk'),
  link(
    'app.patient_clinical_notes',
    'appointment_id',
    'app.appointments',
    'set null',
    'patient_clinical_notes_appointment_fk',
  ),
  link(
    'app.patient_clinical_notes',
    'patient_diagnosis_id',
    'app.patient_diagnoses',
    'set null',
    'patient_clinical_notes_patient_diagnosis_fk',
  ),
  link(
    'app.patient_clinical_notes',
    'patient_id',
    'app.patients',
    'restrict',
    'patient_clinical_notes_patient_fk',
  ),
  link(
    'app.patient_prescriptions',
    'appointment_id',
    'app.appointments',
    'set null',
    'patient_prescriptions_appointment_fk',
  ),
  link(
    'app.patient_prescriptions',
    'patient_id',
    'app.patients',
    'restrict',
    'patient_prescriptions_patient_fk',
  ),
  link(
    'app.patient_images',
    'appointment_id',
    'app.appointments',
    'set null',
    'patient_images_appointment_fk',
  ),
  link('app.patient_images', 'patient_id', 'app.patients', 'restrict', 'patient_images_patient_fk'),
  link(
    'app.patient_images',
    'patient_treatment_id',
    'app.patient_treatments',
    'set null',
    'patient_images_patient_treatment_fk',
  ),
  link(
    'app.patient_reports',
    'patient_id',
    'app.patients',
    'restrict',
    'patient_reports_patient_fk',
  ),
  link(
    'app.patient_treatments',
    'appointment_id',
    'app.appointments',
    'set null',
    'patient_treatments_appointment_fk',
  ),
  link(
    'app.patient_treatments',
    'offering_id',
    'app.offerings',
    'set null',
    'patient_treatments_offering_fk',
  ),
  link(
    'app.patient_treatments',
    'patient_id',
    'app.patients',
    'restrict',
    'patient_treatments_patient_fk',
  ),
  link(
    'app.patient_treatments',
    'patient_offering_id',
    'app.patient_offerings',
    'restrict',
    'patient_treatments_patient_offering_fk',
  ),
  link(
    'app.patient_check_ins',
    'appointment_id',
    'app.appointments',
    'set null',
    'patient_check_ins_appointment_fk',
  ),
  link(
    'app.patient_check_ins',
    'patient_id',
    'app.patients',
    'restrict',
    'patient_check_ins_patient_fk',
  ),
  link(
    'app.patient_check_ins',
    'patient_treatment_id',
    'app.patient_treatments',
    'set null',
    'patient_check_ins_patient_treatment_fk',
  ),
  link(
    'app.patient_reviews',
    'appointment_id',
    'app.appointments',
    'set null',
    'patient_reviews_appointment_fk',
  ),
  link(
    'app.patient_reviews',
    'patient_id',
    'app.patients',
    'restrict',
    'patient_reviews_patient_fk',
  ),
  link(
    'app.patient_feedback_actions',
    'patient_check_in_id',
    'app.patient_check_ins',
    'cascade',
    'patient_feedback_actions_patient_check_in_fk',
  ),
  link(
    'app.patient_feedback_actions',
    'patient_review_id',
    'app.patient_reviews',
    'cascade',
    'patient_feedback_actions_patient_review_fk',
  ),
  link(
    'app.patient_offerings',
    'invoice_item_id',
    'app.invoice_items',
    'cascade',
    'patient_offerings_invoice_item_fk',
  ),
  link(
    'app.patient_offerings',
    'offering_id',
    'app.offerings',
    'restrict',
    'patient_offerings_offering_fk',
  ),
  link(
    'app.patient_offerings',
    'patient_id',
    'app.patients',
    'restrict',
    'patient_offerings_patient_fk',
  ),
  link(
    'app.patient_offering_suggestions',
    'appointment_id',
    'app.appointments',
    'set null',
    'patient_offering_suggestions_appointment_fk',
  ),
  link(
    'app.patient_offering_suggestions',
    'offering_id',
    'app.offerings',
    'restrict',
    'patient_offering_suggestions_offering_fk',
  ),
  link(
    'app.patient_offering_suggestions',
    'patient_check_in_id',
    'app.patient_check_ins',
    'set null',
    'patient_offering_suggestions_patient_check_in_fk',
  ),
  link(
    'app.patient_offering_suggestions',
    'patient_id',
    'app.patients',
    'restrict',
    'patient_offering_suggestions_patient_fk',
  ),
];

/** `pg_constraint.confdeltype` → the `ON DELETE` clause the migration writes. */
const DELETE_ACTION_BY_CODE: Readonly<Record<string, DeleteAction | 'no action'>> = {
  a: 'no action',
  c: 'cascade',
  n: 'set null',
  r: 'restrict',
};

/**
 * Extra row restriction for a link a CHECK ties to another column: a clinical note names a diagnosis
 * only when its kind is 'diagnosis' (chk_patient_clinical_notes_patient_diagnosis).
 */
const ROW_FILTERS: Readonly<Record<string, string>> = {
  'app.patient_clinical_notes.patient_diagnosis_id': "AND kind = 'diagnosis'",
};

/** Rows of a `database.execute()` / operator query result. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}

/** Carries a rolled-back transaction's findings out of {@link withOperatorTransaction}. */
class RolledBack extends Error {
  readonly result: unknown;

  constructor(result: unknown) {
    super('rolled back on purpose');
    this.result = result;
  }
}

/**
 * Rows the shared seed does not create, so every converted link has a child row and a parent row in
 * the clinic: an additional role, a diagnosis, a clinical note of kind 'diagnosis' (the only kind that
 * may name one), and a feedback action under a check-in and one under a review (a row names exactly one
 * parent).
 */
async function seedLinkRows(organizationId: number): Promise<void> {
  await operatorQuery.unsafe(
    `INSERT INTO tenancy.membership_additional_roles (membership_id, role_id, organization_id, position)
       SELECT m.id, r.id, m.organization_id, 1
         FROM tenancy.memberships m
         JOIN tenancy.roles r ON r.organization_id = m.organization_id AND r.id <> m.role_id
        WHERE m.organization_id = $1
        ORDER BY m.id, r.id LIMIT 1
     ON CONFLICT DO NOTHING`,
    [organizationId],
  );
  await operatorQuery.unsafe(
    `INSERT INTO app.patient_diagnoses (public_id, organization_id, name) VALUES ($2, $1, 'Test diagnosis')`,
    [organizationId, generatePublicId('patientDiagnosis')],
  );
  await operatorQuery.unsafe(
    `INSERT INTO app.patient_clinical_notes (public_id, organization_id, patient_id, kind, text)
     SELECT $2, p.organization_id, p.id, 'diagnosis', 'Test note'
       FROM app.patients p WHERE p.organization_id = $1 ORDER BY p.id LIMIT 1`,
    [organizationId, generatePublicId('patientClinicalNote')],
  );
  for (const [parentTable, parentColumn] of [
    ['patient_check_ins', 'patient_check_in_id'],
    ['patient_reviews', 'patient_review_id'],
  ] as const) {
    await operatorQuery.unsafe(
      `INSERT INTO app.patient_feedback_actions (public_id, organization_id, ${parentColumn}, action)
         SELECT $2, p.organization_id, p.id, 'doctor_called'
           FROM app.${parentTable} p WHERE p.organization_id = $1 ORDER BY p.id LIMIT 1`,
      [organizationId, generatePublicId('patientFeedbackAction')],
    );
  }
}

describe('Integration: tenant composite foreign keys (B2-5)', () => {
  let app: FastifyInstance;
  let victim: AppFixture;
  let other: AppFixture;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    // Two clinics seeded the way the API seeds them: the victim's rows are re-pointed at the other
    // clinic's records. Seeding through the API also shows every real write satisfies the new keys.
    victim = await createAppFixture(app);
    await seedAppRecordOfEveryKind({ app, fixture: victim });
    other = await createAppFixture(app);
    await seedAppRecordOfEveryKind({ app, fixture: other });
    await seedLinkRows(victim.organization.id);
    await seedLinkRows(other.organization.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps every converted constraint composite, on the organization column and the same delete action', async () => {
    const rows = rowsOf<{
      constraint_name: string;
      child_table: string;
      child_columns: string;
      parent_columns: string;
      parent_table: string;
      delete_action: string;
      delete_set_columns: string | null;
      is_validated: boolean;
    }>(
      await operatorQuery.unsafe(
        `
        SELECT c.conname AS constraint_name,
               c.conrelid::regclass::text AS child_table,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                  FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS child_columns,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                  FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS parent_columns,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                  FROM unnest(c.confdelsetcols) WITH ORDINALITY AS k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS delete_set_columns,
               c.confrelid::regclass::text AS parent_table,
               c.confdeltype::text AS delete_action,
               c.convalidated AS is_validated
          FROM pg_constraint c
         WHERE c.contype = 'f' AND c.conname = ANY($1)
        `,
        [CONVERSIONS.map((conversion) => conversion.constraint)],
      ),
    );
    const byName = new Map(rows.map((row) => [row.constraint_name, row]));
    for (const conversion of CONVERSIONS) {
      const row = byName.get(conversion.constraint);
      expect(row, `${conversion.constraint} does not exist`).toBeDefined();
      expect(row?.child_table).toBe(conversion.table);
      expect(row?.child_columns).toBe(`organization_id,${conversion.column}`);
      expect(row?.parent_table).toBe(conversion.parent);
      expect(row?.parent_columns).toBe('organization_id,id');
      expect(row?.is_validated, `${conversion.constraint} was left NOT VALID`).toBe(true);
      expect(DELETE_ACTION_BY_CODE[row?.delete_action ?? '']).toBe(conversion.onDelete);
      // SET NULL names the link column alone: clearing organization_id would break its NOT NULL.
      expect(row?.delete_set_columns ?? null).toBe(
        conversion.onDelete === 'set null' ? conversion.column : null,
      );
    }

    // The single-column keys they replaced are gone: no converted column refers to its parent alone.
    const singleColumn = rowsOf<{ constraint_name: string }>(
      await operatorQuery.unsafe(
        `
        SELECT c.conname AS constraint_name
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f' AND cardinality(c.conkey) = 1
           AND c.conrelid::regclass::text || '.' || a.attname || '>' || c.confrelid::regclass::text = ANY($1)
        `,
        [
          CONVERSIONS.map(
            (conversion) => `${conversion.table}.${conversion.column}>${conversion.parent}`,
          ),
        ],
      ),
    );
    expect(singleColumn.map((row) => row.constraint_name)).toEqual([]);
  });

  it.each(
    CONVERSIONS.map((conversion) => [`${conversion.table}.${conversion.column}`, conversion]),
  )("refuses a %s that names another clinic's record", async (_label, conversion) => {
    const { table, column, parent } = conversion;
    // A victim row, preferring one whose link is set (a feedback action names exactly one parent).
    const [child] = rowsOf<{ location: string }>(
      await operatorQuery.unsafe(
        `SELECT ctid::text AS location FROM ${table}
            WHERE organization_id = $1 ${ROW_FILTERS[`${table}.${column}`] ?? ''}
            ORDER BY (${column} IS NULL), ctid LIMIT 1`,
        [victim.organization.id],
      ),
    );
    expect(child, `the seed creates no ${table} row`).toBeDefined();
    // A record of the other clinic, preferring one no row links to yet (a link can be unique, as an
    // invoice line sells one patient package).
    const [foreignRecord] = rowsOf<{ id: number }>(
      await operatorQuery.unsafe(
        `SELECT p.id FROM ${parent} p
            WHERE p.organization_id = $1
            ORDER BY EXISTS (SELECT 1 FROM ${table} c WHERE c.${column} = p.id), p.id LIMIT 1`,
        [other.organization.id],
      ),
    );
    expect(foreignRecord, `the seed creates no ${parent} row in the other clinic`).toBeDefined();

    const failure = await operatorQuery
      .unsafe(`UPDATE ${table} SET ${column} = $1 WHERE ctid = $2::tid`, [
        foreignRecord?.id,
        child?.location,
      ])
      .then(
        () => null,
        (error: unknown) => error as { code?: string; constraint?: string; message?: string },
      );
    expect(failure, `${table}.${column} accepted another clinic's ${parent} row`).not.toBeNull();
    expect(failure?.code, failure?.message).toBe('23503');
    expect(failure?.constraint).toBe(conversion.constraint);
  });

  it('clears only the link when the parent is deleted (ON DELETE SET NULL keeps organization_id)', async () => {
    const outcome = await withOperatorTransaction(async (transaction) => {
      const [patient] = rowsOf<{ id: number }>(
        await transaction.unsafe(
          'SELECT id FROM app.patients WHERE organization_id = $1 ORDER BY id LIMIT 1',
          [victim.organization.id],
        ),
      );
      const [lead] = rowsOf<{ id: number }>(
        await transaction.unsafe(
          'SELECT id FROM app.leads WHERE organization_id = $1 ORDER BY id LIMIT 1',
          [victim.organization.id],
        ),
      );
      expect(patient && lead, 'the seed creates no patient or no lead').toBeTruthy();
      await transaction.unsafe('UPDATE app.patients SET lead_id = $1 WHERE id = $2', [
        lead?.id,
        patient?.id,
      ]);
      await transaction.unsafe('DELETE FROM app.leads WHERE id = $1', [lead?.id]);
      const [after] = rowsOf<{ organization_id: number; lead_id: number | null }>(
        await transaction.unsafe(
          'SELECT organization_id::int AS organization_id, lead_id FROM app.patients WHERE id = $1',
          [patient?.id],
        ),
      );
      throw new RolledBack(after);
    }).catch((error: unknown) => {
      if (error instanceof RolledBack) return error.result;
      throw error;
    });
    expect(outcome).toEqual({ organization_id: victim.organization.id, lead_id: null });
  });
});
