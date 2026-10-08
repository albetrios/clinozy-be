import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { jsonQuery, type JsonValue } from '@/tests/helpers/json-query.helper.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Sub-domain 3, Offerings (routes-final §3, launch ROUTE #128): 3.A groups, 3.B offerings, 3.C
 * offers, the gates by role and the saved-view filters — one flow, step by step, over the fixture
 * organization (the launch's curl checks, `tooling/dev/live-api/checks/offerings.checks.sh`).
 */
describe('Offerings — integration (routes-final §3)', () => {
  const S = String(Date.now());
  const NOWHERE_BRANCH = 'brn_aaaaaaaaaaaaaaaaaaaaa';
  /** The names of the last list page, without this run's suffix. */
  const NAMES = `[.data[].name | rtrimstr(" ${S}")] | join(",")`;
  const FIELDS = '[.error.errors[].field] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let adajan = '';

  let peelsGroup = '';
  let hairGroup = '';
  let consultation = '';
  let peel = '';
  let laser = '';
  let liveOffer = '';
  let scheduledOffer = '';
  let alwaysOffer = '';

  /** Every page's names of `path`, `limit` at a time, joined. */
  async function pageNames(path: string, limit: number): Promise<string> {
    const names: string[] = [];
    let after = '';
    for (;;) {
      await flow.call('GET', `${path}&limit=${limit}${after ? `&after=${after}` : ''}`);
      names.push(flow.last(NAMES));
      after = flow.last('.meta.pagination.next // empty');
      if (!after) break;
    }
    return names.join(',');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    adajan = fixture.branches.adajan;
  });

  afterAll(async () => {
    await app.close();
  });

  it('3.A offering groups (routes 1–6)', async () => {
    flow.as('owner');
    await flow.expect(200, 'group create Laser (20)', 'POST', '/app/offering-groups', {
      name: `Laser ${S}`,
      sort_order: 20,
    });
    await flow.expect(200, 'group create Facials (10)', 'POST', '/app/offering-groups', {
      name: `Facials ${S}`,
      sort_order: 10,
    });
    await flow.expect(200, 'group create Peels (10)', 'POST', '/app/offering-groups', {
      name: `Peels ${S}`,
      sort_order: 10,
    });
    peelsGroup = flow.last('.data.id');
    await flow.expect(200, 'group create Hair (0)', 'POST', '/app/offering-groups', {
      name: `Hair ${S}`,
      sort_order: 0,
    });
    hairGroup = flow.last('.data.id');
    await flow.expect(409, 'group name taken in another case', 'POST', '/app/offering-groups', {
      name: `LASER ${S}`,
    });
    await flow.expect(400, 'group sort_order 10000', 'POST', '/app/offering-groups', {
      name: `Big ${S}`,
      sort_order: 10000,
    });
    await flow.expect(
      422,
      'group create without X-Idempotency-Key',
      'POST',
      '/app/offering-groups',
      { name: `Nokey ${S}` },
      { idempotencyKey: false },
    );
    await flow.expect(200, 'group list', 'GET', `/app/offering-groups?q=${S}`);
    flow.expectValue('group list: menu order (O8)', NAMES, 'Hair,Facials,Peels,Laser');
    flow.expectValue('group list: total', '.meta.pagination.estimated_total', 4);
    await flow.expect(
      200,
      'group list desc',
      'GET',
      `/app/offering-groups?q=${S}&sort=sort_order&order=desc`,
    );
    flow.expectValue('group list desc: both keys flip', NAMES, 'Laser,Peels,Facials,Hair');
    await flow.expect(
      200,
      'group list by name',
      'GET',
      `/app/offering-groups?q=${S}&sort=name&order=asc`,
    );
    flow.expectValue('group list by name', NAMES, 'Facials,Hair,Laser,Peels');
    flow.expectEqual(
      'group list paged 1 by 1 across the sort_order tie',
      await pageNames(`/app/offering-groups?q=${S}`, 1),
      'Hair,Facials,Peels,Laser',
    );
    await flow.expect(200, 'group get', 'GET', `/app/offering-groups/${peelsGroup}`);
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(
      404,
      'group get unknown',
      'GET',
      '/app/offering-groups/ogr_aaaaaaaaaaaaaaaaaaaaa',
    );
    await flow.expect(200, 'group reorder', 'PATCH', `/app/offering-groups/${peelsGroup}`, {
      sort_order: 5,
      expected_updated_at: updatedAt,
    });
    await flow.expect(409, 'group stale save', 'PATCH', `/app/offering-groups/${peelsGroup}`, {
      name: `Chem ${S}`,
      expected_updated_at: updatedAt,
    });
    flow.expectValue('group stale save: record_changed', '.error.reason', 'record_changed');
    await flow.expect(
      409,
      "group rename onto another group's name",
      'PATCH',
      `/app/offering-groups/${peelsGroup}`,
      { name: `hair ${S}` },
    );
    await flow.expect(
      400,
      'group PATCH with only expected_updated_at',
      'PATCH',
      `/app/offering-groups/${peelsGroup}`,
      { expected_updated_at: updatedAt },
    );
    await flow.expect(
      400,
      'group PATCH unknown field',
      'PATCH',
      `/app/offering-groups/${peelsGroup}`,
      { tone: 'sky' },
    );
    await flow.expect(
      400,
      'group delete without reason',
      'DELETE',
      `/app/offering-groups/${hairGroup}`,
    );
    await flow.expect(
      400,
      'group delete other without note',
      'DELETE',
      `/app/offering-groups/${hairGroup}?reason=other`,
    );
    await flow.expect(
      204,
      'group delete (empty)',
      'DELETE',
      `/app/offering-groups/${hairGroup}?reason=not_needed`,
    );
    await flow.expect(404, 'group get deleted', 'GET', `/app/offering-groups/${hairGroup}`);
    await flow.expect(
      404,
      'group delete again',
      'DELETE',
      `/app/offering-groups/${hairGroup}?reason=not_needed`,
    );
    await flow.expect(200, 'group create takes the deleted name', 'POST', '/app/offering-groups', {
      name: `Hair ${S}`,
      sort_order: 1,
    });
    const hairGroupAgain = flow.last('.data.id');
    await flow.expect(
      409,
      'group restore over a reused name',
      'POST',
      `/app/offering-groups/${hairGroup}/restore`,
    );
    flow.expectValue(
      'group restore over a reused name: record_restore_conflict',
      '.error.reason',
      'record_restore_conflict',
    );
    await flow.expect(
      204,
      'group delete the new one',
      'DELETE',
      `/app/offering-groups/${hairGroupAgain}?reason=duplicate`,
    );
    await flow.expect(200, 'group restore', 'POST', `/app/offering-groups/${hairGroup}/restore`);
    await flow.expect(
      409,
      'group restore a live group',
      'POST',
      `/app/offering-groups/${hairGroup}/restore`,
    );
    flow.expectValue(
      'group restore a live group: record_not_deleted',
      '.error.reason',
      'record_not_deleted',
    );
  });

  it('3.B offerings (routes 7–13)', async () => {
    flow.as('owner');
    await flow.expect(200, 'offering create consultation', 'POST', '/app/offerings', {
      name: `Skin consultation ${S}`,
      category: 'consultation',
      price: 500,
    });
    flow.expectValue(
      'offering consultation: GST 0, lowest 0, no offer price, every branch',
      '[.data.gst_percent, .data.min_price, .data.offer_price, (.data.branch_ids|length)] | map(tostring) | join(",")',
      '0,0,null,0',
    );
    consultation = flow.last('.data.id');
    await flow.expect(200, 'offering create peel at Vesu in Peels', 'POST', '/app/offerings', {
      name: `Glycolic peel ${S}`,
      price: 3000,
      offer_price: 2500,
      min_price: 2000,
      offering_group_id: peelsGroup,
      branch_ids: [vesu],
      search_terms: ['chemical peel', `glow${S}`],
      sessions: 4,
      validity_days: 180,
    });
    flow.expectValue('offering peel: GST 18 by default', '.data.gst_percent', 18);
    flow.expectValue(
      'offering peel: group and branch',
      '[.data.offering_group_id, .data.branch_ids[0]] | join(",")',
      `${peelsGroup},${vesu}`,
    );
    peel = flow.last('.data.id');
    const peelNumber = flow.last('.data.offering_number');
    await flow.expect(200, 'offering create laser at Adajan', 'POST', '/app/offerings', {
      name: `Laser hair reduction ${S}`,
      category: 'lhr',
      price: 6000,
      branch_ids: [adajan],
      search_terms: [`lhr${S}`],
    });
    laser = flow.last('.data.id');
    await flow.expect(400, 'O4 offer price above price', 'POST', '/app/offerings', {
      name: `Bad ${S}`,
      price: 100,
      offer_price: 120,
    });
    flow.expectValue('O4 offer price above price: field', FIELDS, 'offer_price');
    await flow.expect(400, 'O4 lowest above offer price', 'POST', '/app/offerings', {
      name: `Bad ${S}`,
      price: 100,
      offer_price: 80,
      min_price: 90,
    });
    flow.expectValue('O4 lowest above offer price: field', FIELDS, 'min_price');
    await flow.expect(400, 'O4 lowest above price (no offer price)', 'POST', '/app/offerings', {
      name: `Bad ${S}`,
      price: 100,
      min_price: 150,
    });
    flow.expectValue(
      'O4 lowest above price: message',
      '.error.errors[0].message',
      "The lowest price can't be above the price",
    );
    await flow.expect(
      400,
      'O4 in Spanish',
      'POST',
      '/app/offerings',
      { name: `Bad ${S}`, price: 100, offer_price: 120 },
      { language: 'es' },
    );
    flow.expectValue(
      'O4 in Spanish: message',
      '.error.errors[0].message',
      'El precio de oferta no puede superar el precio',
    );
    await flow.expect(
      400,
      'O4 on the merged PATCH row (price below offer price)',
      'PATCH',
      `/app/offerings/${peel}`,
      { price: 2400 },
    );
    flow.expectValue('O4 merged row: field', FIELDS, 'offer_price');
    await flow.expect(400, 'O4 PATCH offer price below lowest', 'PATCH', `/app/offerings/${peel}`, {
      offer_price: 1500,
    });
    flow.expectValue('O4 PATCH offer price below lowest: field', FIELDS, 'min_price');
    await flow.expect(
      200,
      'offering PATCH the three prices together',
      'PATCH',
      `/app/offerings/${peel}`,
      { price: 2800, offer_price: 2200, min_price: 1800 },
    );
    await flow.expect(409, 'offering name taken in another case', 'POST', '/app/offerings', {
      name: `GLYCOLIC PEEL ${S}`,
      price: 1,
    });
    await flow.expect(400, 'offering unknown group', 'POST', '/app/offerings', {
      name: `Bad ${S}`,
      price: 1,
      offering_group_id: 'ogr_aaaaaaaaaaaaaaaaaaaaa',
    });
    flow.expectValue('offering unknown group: field', FIELDS, 'offering_group_id');
    await flow.expect(400, 'offering unknown branch', 'POST', '/app/offerings', {
      name: `Bad ${S}`,
      price: 1,
      branch_ids: [NOWHERE_BRANCH],
    });
    await flow.expect(400, 'offering default_room_id gone (O6)', 'POST', '/app/offerings', {
      name: `Bad ${S}`,
      price: 1,
      default_room_id: null,
    });
    await flow.expect(400, 'offering group_id renamed (O1)', 'POST', '/app/offerings', {
      name: `Bad ${S}`,
      price: 1,
      group_id: null,
    });
    await flow.expect(400, 'offering a branch twice', 'POST', '/app/offerings', {
      name: `Bad ${S}`,
      price: 1,
      branch_ids: [vesu, vesu],
    });
    await flow.expect(200, 'offering list', 'GET', `/app/offerings?q=${S}`);
    flow.expectValue(
      'offering list: newest first',
      NAMES,
      'Laser hair reduction,Glycolic peel,Skin consultation',
    );
    await flow.expect(200, 'offering q by #number', 'GET', `/app/offerings?q=%23${peelNumber}`);
    flow.expectValue('offering q by #number', '.data[0].id', peel);
    await flow.expect(200, 'offering q by search term (O9)', 'GET', `/app/offerings?q=glow${S}`);
    flow.expectValue('offering q by search term', NAMES, 'Glycolic peel');
    await flow.expect(
      200,
      'offering branch Vesu (O5)',
      'GET',
      `/app/offerings?q=${S}&branch_id=${vesu}&sort=name&order=asc`,
    );
    flow.expectValue(
      'offering branch Vesu: Vesu and every-branch',
      NAMES,
      'Glycolic peel,Skin consultation',
    );
    await flow.expect(
      200,
      'offering branch Adajan',
      'GET',
      `/app/offerings?q=${S}&branch_id=${adajan}&sort=name&order=asc`,
    );
    flow.expectValue('offering branch Adajan', NAMES, 'Laser hair reduction,Skin consultation');
    await flow.expect(
      200,
      'offering unknown branch filter',
      'GET',
      `/app/offerings?q=${S}&branch_id=${NOWHERE_BRANCH}`,
    );
    flow.expectValue(
      'offering unknown branch filter: empty',
      '.meta.pagination.estimated_total',
      0,
    );
    await flow.expect(
      200,
      'offering group filter',
      'GET',
      `/app/offerings?q=${S}&offering_group_id=${peelsGroup}`,
    );
    flow.expectValue('offering group filter', NAMES, 'Glycolic peel');
    await flow.expect(
      400,
      'offering old group_id filter',
      'GET',
      `/app/offerings?group_id=${peelsGroup}`,
    );
    await flow.expect(
      200,
      'offering branch_ids [] = every branch',
      'PATCH',
      `/app/offerings/${laser}`,
      { branch_ids: [] },
    );
    await flow.expect(
      200,
      'offering branch Vesu now holds the laser',
      'GET',
      `/app/offerings?q=${S}&branch_id=${vesu}`,
    );
    flow.expectValue('offering branch Vesu: three', '.meta.pagination.estimated_total', 3);
    await flow.expect(200, 'offering back to Adajan', 'PATCH', `/app/offerings/${laser}`, {
      branch_ids: [adajan],
    });
    await flow.expect(
      409,
      'O7 group delete while an offering uses it',
      'DELETE',
      `/app/offering-groups/${peelsGroup}?reason=not_needed`,
    );
    flow.expectValue(
      'O7 message',
      '.error.detail',
      'This group still has offerings — move or ungroup them first',
    );
    await flow.expect(200, 'offering deactivate', 'PATCH', `/app/offerings/${consultation}`, {
      is_active: false,
    });
    await flow.expect(
      200,
      'offering is_active filter',
      'GET',
      `/app/offerings?q=${S}&is_active=true`,
    );
    flow.expectValue('offering is_active filter: two', '.meta.pagination.estimated_total', 2);
    await flow.expect(204, 'offering delete', 'DELETE', `/app/offerings/${peel}?reason=mistake`);
    await flow.expect(404, 'offering get deleted', 'GET', `/app/offerings/${peel}`);
    await flow.expect(
      204,
      'O7 group delete once empty',
      'DELETE',
      `/app/offering-groups/${peelsGroup}?reason=mistake`,
    );
    await flow.expect(200, 'group restore', 'POST', `/app/offering-groups/${peelsGroup}/restore`);
    await flow.expect(200, 'offering restore', 'POST', `/app/offerings/${peel}/restore`);
    await flow.expect(409, 'offering restore a live one', 'POST', `/app/offerings/${peel}/restore`);
    await flow.expect(
      200,
      'offering export ignores limit (O14)',
      'GET',
      `/app/offerings/exports?q=${S}&limit=1`,
    );
    flow.expectValue(
      'offering export: rows and file',
      '[.data.row_count, (.data.file_name | startswith("offerings-"))] | map(tostring) | join(",")',
      '3,true',
    );
  });

  it('3.C offers (routes 14–19)', async () => {
    flow.as('owner');
    const today = calendarDay(fixture, 0);
    const past = calendarDay(fixture, -30);
    const yesterday = calendarDay(fixture, -1);
    const soon = calendarDay(fixture, 10);
    const later = calendarDay(fixture, 40);
    const code = `glow${S.slice(-6)}`;
    const codeUpper = code.toUpperCase();
    await flow.expect(200, 'offer create live', 'POST', '/app/offers', {
      name: `Navratri glow ${S}`,
      code,
      value: 20,
      offering_ids: [peel],
      starts_on: past,
      ends_on: soon,
    });
    flow.expectValue(
      'offer live: status and code stored upper',
      '[.data.status, .data.code] | join(",")',
      `live,${codeUpper}`,
    );
    liveOffer = flow.last('.data.id');
    await flow.expect(200, 'offer create scheduled at Adajan', 'POST', '/app/offers', {
      name: `Diwali laser ${S}`,
      kind: 'amount',
      value: 1000,
      offering_ids: [laser],
      branch_ids: [adajan],
      starts_on: soon,
      ends_on: later,
    });
    flow.expectValue('offer scheduled', '.data.status', 'scheduled');
    scheduledOffer = flow.last('.data.id');
    await flow.expect(200, 'offer create paused', 'POST', '/app/offers', {
      name: `Peel extra ${S}`,
      kind: 'extra',
      value: 1,
      offering_ids: [peel],
      is_active: false,
    });
    flow.expectValue('offer paused', '.data.status', 'paused');
    await flow.expect(200, 'offer create ended at Vesu', 'POST', '/app/offers', {
      name: `Monsoon fixed ${S}`,
      kind: 'fixed',
      value: 1999.5,
      offering_ids: [peel],
      branch_ids: [vesu],
      starts_on: past,
      ends_on: yesterday,
    });
    flow.expectValue('offer ended', '.data.status', 'ended');
    await flow.expect(200, 'offer create dateless', 'POST', '/app/offers', {
      name: `Always on ${S}`,
      value: 5,
      offering_ids: [peel, laser],
    });
    flow.expectValue('offer dateless is live', '.data.status', 'live');
    alwaysOffer = flow.last('.data.id');
    await flow.expect(409, 'O11 code in use, any case', 'POST', '/app/offers', {
      name: `Dup ${S}`,
      code: codeUpper,
      value: 10,
      offering_ids: [peel],
    });
    await flow.expect(400, 'O11 code with a dash', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      code: 'GLOW-20',
      value: 10,
      offering_ids: [peel],
    });
    await flow.expect(400, 'O11 code of 17', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      code: 'ABCDEFGHIJKLMNOPQ',
      value: 10,
      offering_ids: [peel],
    });
    for (const value of [0, 101, 12.5]) {
      await flow.expect(400, `O11 percent ${value}`, 'POST', '/app/offers', {
        name: `Bad ${S}`,
        value,
        offering_ids: [peel],
      });
    }
    await flow.expect(400, 'O11 amount 0', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      kind: 'amount',
      value: 0,
      offering_ids: [peel],
    });
    for (const value of [100, 1.5]) {
      await flow.expect(400, `O11 extra ${value}`, 'POST', '/app/offers', {
        name: `Bad ${S}`,
        kind: 'extra',
        value,
        offering_ids: [peel],
      });
    }
    flow.expectValue('O11 extra: field', FIELDS, 'value');
    await flow.expect(400, 'offer ends before it starts', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      value: 5,
      offering_ids: [peel],
      starts_on: soon,
      ends_on: today,
    });
    flow.expectValue('offer ends before it starts: field', FIELDS, 'ends_on');
    await flow.expect(400, 'O12 inactive offering', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      value: 5,
      offering_ids: [consultation],
    });
    flow.expectValue(
      'O12 message',
      '.error.errors[0].message',
      `${consultation} is not an active offering of this organization`,
    );
    await flow.expect(
      400,
      'O12 in Spanish',
      'POST',
      '/app/offers',
      { name: `Bad ${S}`, value: 5, offering_ids: [consultation] },
      { language: 'es' },
    );
    flow.expectValue(
      'O12 in Spanish: message',
      '.error.errors[0].message',
      `${consultation} no es un servicio activo de esta organización`,
    );
    await flow.expect(400, 'offer unknown offering', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      value: 5,
      offering_ids: ['off_aaaaaaaaaaaaaaaaaaaaa'],
    });
    await flow.expect(400, 'offer unknown branch', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      value: 5,
      offering_ids: [peel],
      branch_ids: [NOWHERE_BRANCH],
    });
    await flow.expect(400, 'offer no offerings', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      value: 5,
      offering_ids: [],
    });
    await flow.expect(400, 'offer is_paused gone (O10)', 'POST', '/app/offers', {
      name: `Bad ${S}`,
      value: 5,
      offering_ids: [peel],
      is_paused: true,
    });
    await flow.expect(200, 'offer list', 'GET', `/app/offers?q=${S}`);
    flow.expectValue(
      'offer list: Live → Scheduled → Paused → Ended, newest first (O10)',
      NAMES,
      'Always on,Navratri glow,Diwali laser,Peel extra,Monsoon fixed',
    );
    await flow.expect(200, 'offer list desc', 'GET', `/app/offers?q=${S}&order=desc`);
    flow.expectValue(
      'offer list desc',
      '[.data[].status] | join(",")',
      'ended,paused,scheduled,live,live',
    );
    flow.expectEqual(
      'offer list paged 2 by 2 (mixed directions)',
      await pageNames(`/app/offers?q=${S}`, 2),
      'Always on,Navratri glow,Diwali laser,Peel extra,Monsoon fixed',
    );
    for (const [status, count] of [
      ['live', 2],
      ['scheduled', 1],
      ['paused', 1],
      ['ended', 1],
    ] as const) {
      await flow.expect(
        200,
        `offer status=${status}`,
        'GET',
        `/app/offers?q=${S}&status=${status}`,
      );
      flow.expectValue(`offer status=${status}: count`, '.meta.pagination.estimated_total', count);
    }
    await flow.expect(400, 'offer status in capitals', 'GET', '/app/offers?status=LIVE');
    await flow.expect(200, 'offer kind=amount', 'GET', `/app/offers?q=${S}&kind=amount`);
    flow.expectValue('offer kind=amount', NAMES, 'Diwali laser');
    await flow.expect(200, 'offer offering_id', 'GET', `/app/offers?q=${S}&offering_id=${laser}`);
    flow.expectValue('offer offering_id', NAMES, 'Always on,Diwali laser');
    await flow.expect(200, 'offer branch Vesu (O5)', 'GET', `/app/offers?q=${S}&branch_id=${vesu}`);
    flow.expectValue('offer branch Vesu: four', '.meta.pagination.estimated_total', 4);
    await flow.expect(200, 'offer sort=starts_on', 'GET', `/app/offers?q=${S}&sort=starts_on`);
    flow.expectValue(
      'offer sort=starts_on keeps dateless offers, last',
      NAMES,
      'Diwali laser,Monsoon fixed,Navratri glow,Always on,Peel extra',
    );
    flow.expectEqual(
      'offer sort=starts_on paged 2 by 2',
      await pageNames(`/app/offers?q=${S}&sort=starts_on`, 2),
      'Diwali laser,Monsoon fixed,Navratri glow,Always on,Peel extra',
    );
    await flow.expect(
      200,
      'offer starts_on_from today',
      'GET',
      `/app/offers?q=${S}&starts_on_from=${today}`,
    );
    flow.expectValue('offer starts_on_from today', NAMES, 'Diwali laser');
    await flow.expect(200, 'offer q by code', 'GET', `/app/offers?q=${code}`);
    flow.expectValue('offer q by code', NAMES, 'Navratri glow');
    await flow.expect(200, 'offer get', 'GET', `/app/offers/${liveOffer}`);
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(200, 'offer pause', 'PATCH', `/app/offers/${liveOffer}`, {
      is_active: false,
      expected_updated_at: updatedAt,
    });
    flow.expectValue('offer pause: paused', '.data.status', 'paused');
    await flow.expect(409, 'offer stale save', 'PATCH', `/app/offers/${liveOffer}`, {
      name: `Stale ${S}`,
      expected_updated_at: updatedAt,
    });
    await flow.expect(200, 'offer resume', 'PATCH', `/app/offers/${liveOffer}`, {
      is_active: true,
    });
    flow.expectValue('offer resume: live', '.data.status', 'live');
    await flow.expect(
      200,
      'offer kind change keeps a fitting value',
      'PATCH',
      `/app/offers/${liveOffer}`,
      { kind: 'extra' },
    );
    await flow.expect(
      400,
      'offer kind change to a value out of range',
      'PATCH',
      `/app/offers/${liveOffer}`,
      { kind: 'percent', value: 150 },
    );
    await flow.expect(200, 'offer back to 20%', 'PATCH', `/app/offers/${liveOffer}`, {
      kind: 'percent',
      value: 20,
    });
    await flow.expect(
      400,
      'offer PATCH end before the kept start',
      'PATCH',
      `/app/offers/${scheduledOffer}`,
      { ends_on: '2026-01-01' },
    );
    await flow.expect(
      409,
      'offer PATCH a code another live offer has',
      'PATCH',
      `/app/offers/${alwaysOffer}`,
      { code },
    );
    await flow.expect(
      400,
      'offer PATCH an inactive offering',
      'PATCH',
      `/app/offers/${alwaysOffer}`,
      { offering_ids: [consultation] },
    );
    await flow.expect(200, 'offer PATCH clears the code', 'PATCH', `/app/offers/${alwaysOffer}`, {
      code: null,
    });
    await flow.expect(400, 'offer PATCH empty body', 'PATCH', `/app/offers/${alwaysOffer}`, {});
    await flow.expect(400, 'offer delete without reason', 'DELETE', `/app/offers/${liveOffer}`);
    await flow.expect(204, 'offer delete', 'DELETE', `/app/offers/${liveOffer}?reason=duplicate`);
    await flow.expect(404, 'offer get deleted', 'GET', `/app/offers/${liveOffer}`);
    await flow.expect(200, 'offer create takes the freed code', 'POST', '/app/offers', {
      name: `Glow again ${S}`,
      code,
      value: 15,
      offering_ids: [peel],
    });
    const glowAgainOffer = flow.last('.data.id');
    await flow.expect(
      409,
      'offer restore over a reused code',
      'POST',
      `/app/offers/${liveOffer}/restore`,
    );
    flow.expectValue(
      'offer restore over a reused code: record_restore_conflict',
      '.error.reason',
      'record_restore_conflict',
    );
    await flow.expect(
      204,
      'offer delete the new one',
      'DELETE',
      `/app/offers/${glowAgainOffer}?reason=mistake`,
    );
    await flow.expect(200, 'offer restore', 'POST', `/app/offers/${liveOffer}/restore`);
    await flow.expect(409, 'offer restore a live one', 'POST', `/app/offers/${liveOffer}/restore`);
  });

  it('gates by role (3.4)', async () => {
    flow.as('counsellor');
    await flow.expect(200, 'counsellor reads groups', 'GET', `/app/offering-groups?q=${S}`);
    await flow.expect(200, 'counsellor reads offers', 'GET', `/app/offers?q=${S}`);
    await flow.expect(200, 'counsellor reads an offering', 'GET', `/app/offerings/${peel}`);
    flow.expectValue('counsellor: min_price hidden (O15)', '.data.min_price', 'null');
    await flow.expect(403, 'counsellor export', 'GET', '/app/offerings/exports');
    await flow.expect(200, 'counsellor creates a group', 'POST', '/app/offering-groups', {
      name: `Counsellor ${S}`,
    });
    await flow.expect(200, 'counsellor creates an offering', 'POST', '/app/offerings', {
      name: `Counsellor ${S}`,
      price: 100,
    });
    await flow.expect(200, 'counsellor creates an offer', 'POST', '/app/offers', {
      name: `Counsellor ${S}`,
      value: 5,
      offering_ids: [peel],
    });
    await flow.expect(200, 'counsellor changes a price (O3)', 'PATCH', `/app/offerings/${peel}`, {
      price: 2900,
    });
    await flow.expect(200, 'counsellor pauses an offer', 'PATCH', `/app/offers/${alwaysOffer}`, {
      is_active: true,
    });
    await flow.expect(
      403,
      'counsellor deletes a group',
      'DELETE',
      `/app/offering-groups/${hairGroup}?reason=mistake`,
    );
    await flow.expect(
      403,
      'counsellor deletes an offering',
      'DELETE',
      `/app/offerings/${consultation}?reason=mistake`,
    );
    await flow.expect(
      403,
      'counsellor deletes an offer',
      'DELETE',
      `/app/offers/${alwaysOffer}?reason=mistake`,
    );

    flow.as('accountant');
    await flow.expect(200, 'accountant reads an offering', 'GET', `/app/offerings/${peel}`);
    flow.expectValue('accountant: min_price shown', '.data.min_price', 1800);
    await flow.expect(200, 'accountant export', 'GET', `/app/offerings/exports?q=${S}`);
    await flow.expect(403, 'accountant creates', 'POST', '/app/offerings', {
      name: `Accountant ${S}`,
      price: 100,
    });
    await flow.expect(403, 'accountant changes', 'PATCH', `/app/offerings/${peel}`, {
      price: 2900,
    });

    flow.as('doctor');
    const exported = await flow.expect(
      200,
      'doctor export (O14)',
      'GET',
      `/app/offerings/exports?q=${S}`,
    );
    const [header = '', ...rows] = jsonQuery(exported as JsonValue, '.data.content').split('\r\n');
    const lowestPriceColumn = header.split(',').indexOf('min_price');
    expect
      .soft(
        [
          ...new Set(
            rows.filter((row) => row.length > 0).map((row) => row.split(',')[lowestPriceColumn]),
          ),
        ].join('|'),
        'doctor export: lowest price blank in every row',
      )
      .toBe('');
    await flow.expect(403, 'doctor creates a group', 'POST', '/app/offering-groups', {
      name: `Doctor ${S}`,
    });

    flow.as('front_desk');
    await flow.expect(200, 'front desk reads offerings', 'GET', `/app/offerings?q=${S}`);
    flow.expectValue(
      'front desk: min_price hidden',
      '[.data[].min_price] | unique | map(tostring) | join(",")',
      'null',
    );
    await flow.expect(403, 'front desk export', 'GET', '/app/offerings/exports');
    await flow.expect(403, 'front desk creates an offer', 'POST', '/app/offers', {
      name: `Desk ${S}`,
      value: 5,
      offering_ids: [peel],
    });
  });

  it("saved views take the offerings list's filters (UC5)", async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'saved view with offering_group_id and branch_id',
      'POST',
      '/app/memberships/me/saved-views',
      {
        list_key: 'offerings',
        label: `Vesu peels ${S}`,
        filters: { offering_group_id: peelsGroup, branch_id: vesu, q: 'peel' },
      },
    );
    await flow.expect(
      400,
      'saved view with the old group_id',
      'POST',
      '/app/memberships/me/saved-views',
      { list_key: 'offerings', label: `Old ${S}`, filters: { group_id: peelsGroup } },
    );
  });
});
