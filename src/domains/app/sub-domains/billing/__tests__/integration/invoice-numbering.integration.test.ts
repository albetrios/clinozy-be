import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * B11: the statutory `invoice_number` runs per branch and financial year ("2026-27/0412") — padded
 * to four digits, never cut: the 10,000th invoice of a branch's year is "…/10000", not a copy of
 * "…/1000" that would break the unique number and stop the branch's billing.
 */
describe('Invoice numbering — integration (B11)', () => {
  const S = String(Date.now());
  const digits = `3${S.slice(-7)}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let offering = '';
  let contact = '';

  /** A one-line bill at Vesu; answers its number. */
  async function bill(label: string): Promise<string> {
    await flow.expect(200, label, 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: contact,
      items: [{ offering_id: offering, quantity: 1 }],
    });
    return flow.last('.data.invoice_number');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    flow.as('owner');
    await flow.expect(200, 'an offering', 'POST', '/app/offerings', {
      name: `Consult ${S}`,
      price: 500,
    });
    offering = flow.last('.data.id');
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Ravi',
      last_name: `n${S}`,
      phones: [{ phone: `+91${digits}01`, is_primary: true }],
    });
    contact = flow.last('.data.id');
    await flow.expect(200, 'their patient file', 'POST', '/app/patients', {
      contact_id: contact,
      home_branch_id: vesu,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('pads to four digits and grows past 9999 without cutting the number', async () => {
    const first = await bill('the first bill of the year');
    const financialYear = flow.last('.data.financial_year');
    flow.expectEqual('padded to four digits', first, `${financialYear}/0001`);

    await getOperatorSql()`
      UPDATE app.record_counters SET last_value = 9999
      WHERE organization_id = ${fixture.organization.id}
        AND counter_key = ${`invoices:${fixture.branchIds.vesu}:${financialYear}`}
    `;
    flow.expectEqual('the 10,000th', await bill('the 10,000th bill'), `${financialYear}/10000`);
    flow.expectEqual('and the next', await bill('the 10,001st bill'), `${financialYear}/10001`);
  });
});
