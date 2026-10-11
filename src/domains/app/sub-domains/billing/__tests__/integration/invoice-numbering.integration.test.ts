import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
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

  /** A one-line bill at Vesu (or `branch`, dated `invoiceDate`); answers its number. */
  async function bill(
    label: string,
    options: { branch?: string; invoiceDate?: string } = {},
  ): Promise<string> {
    await flow.expect(200, label, 'POST', '/app/invoices', {
      branch_id: options.branch ?? vesu,
      contact_id: contact,
      items: [{ offering_id: offering, quantity: 1 }],
      ...(options.invoiceDate === undefined ? {} : { invoice_date: options.invoiceDate }),
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

    await operatorQuery`
      UPDATE app.record_counters SET last_value = 9999
      WHERE organization_id = ${fixture.organization.id}
        AND counter_key = ${`invoices:${fixture.branchIds.vesu}:${financialYear}`}
    `;
    flow.expectEqual('the 10,000th', await bill('the 10,000th bill'), `${financialYear}/10000`);
    flow.expectEqual('and the next', await bill('the 10,001st bill'), `${financialYear}/10001`);
  });

  it("restarts each branch's series on 1 April, the new financial year (D23)", async () => {
    flow.expectEqual(
      'the last day of a financial year',
      await bill('31 March at Vesu', { invoiceDate: '2025-03-31' }),
      '2024-25/0001',
    );
    flow.expectEqual(
      'the first day of the next one starts again',
      await bill('1 April at Vesu', { invoiceDate: '2025-04-01' }),
      '2025-26/0001',
    );
    flow.expectEqual(
      'and goes on',
      await bill('2 April at Vesu', { invoiceDate: '2025-04-02' }),
      '2025-26/0002',
    );
    flow.expectEqual(
      'another branch (its own GSTIN) has its own series',
      await bill('1 April at Adajan', {
        branch: fixture.branches.adajan,
        invoiceDate: '2025-04-01',
      }),
      '2025-26/0001',
    );
    flow.expectEqual(
      'a late bill of the old year continues its series',
      await bill('30 March at Vesu, billed late', { invoiceDate: '2025-03-30' }),
      '2024-25/0002',
    );
    const april = flow.last('.data.id');
    await flow.expect(
      400,
      'a date moved into another financial year (B11)',
      'PATCH',
      `/app/invoices/${april}`,
      { invoice_date: '2025-04-03' },
    );
    flow.expectValue('the date: field', '[.error.errors[].field] | join(",")', 'invoice_date');
  });
});
