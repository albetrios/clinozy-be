import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Offers at their edges (task O1, docs/reviews/launch-confidence-plan-2026-10-09.md;
 * routes-final 3.C, O10, O12, D41): an offer is live on its first and its last day and ended the
 * day after, on the organization's calendar — the response and the list's status filter agree;
 * an offering made inactive under a live offer leaves the offer readable and pausable, while a
 * save that names it again is refused.
 */
describe('Offers — at the edges (O10, O12)', () => {
  const S = String(Date.now());
  const IDS = '[.data[].id] | sort | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let peel = '';
  let laser = '';

  /** A new offering; answers its id. */
  async function offering(name: string): Promise<string> {
    await flow.expect(200, `offering ${name}`, 'POST', '/app/offerings', {
      name: `${name} ${S}`,
      price: 2000,
    });
    return flow.last('.data.id');
  }

  /** A new offer on `offerings` from `startsOn` to `endsOn`; answers its id. */
  async function offer(
    name: string,
    startsOn: string,
    endsOn: string,
    offerings: string[],
  ): Promise<string> {
    await flow.expect(200, `offer ${name}`, 'POST', '/app/offers', {
      name: `${name} ${S}`,
      value: 10,
      offering_ids: offerings,
      starts_on: startsOn,
      ends_on: endsOn,
    });
    return flow.last('.data.id');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    peel = await offering('Peel');
    laser = await offering('Laser');
  });

  afterAll(async () => {
    await app.close();
  });

  it("live on its first and last day, ended the day after — on the organization's calendar", async () => {
    const today = calendarDay(fixture, 0);
    const startsToday = await offer('Starts today', today, calendarDay(fixture, 5), [peel]);
    flow.expectValue('first day: live', '.data.status', 'live');
    const endsToday = await offer('Ends today', calendarDay(fixture, -5), today, [peel]);
    flow.expectValue('last day: live', '.data.status', 'live');
    const endedYesterday = await offer(
      'Ended yesterday',
      calendarDay(fixture, -5),
      calendarDay(fixture, -1),
      [peel],
    );
    flow.expectValue('the day after: ended', '.data.status', 'ended');
    const startsTomorrow = await offer(
      'Starts tomorrow',
      calendarDay(fixture, 1),
      calendarDay(fixture, 5),
      [peel],
    );
    flow.expectValue('the day before: scheduled', '.data.status', 'scheduled');
    const oneDay = await offer('One day', today, today, [peel]);
    flow.expectValue('a one-day offer, that day: live', '.data.status', 'live');

    const ofThisRun = (ids: string[]) => ids.sort().join(',');
    await flow.expect(200, 'the live ones', 'GET', `/app/offers?status=live&q=${S}&limit=50`);
    flow.expectValue('the filter agrees', IDS, ofThisRun([startsToday, endsToday, oneDay]));
    await flow.expect(200, 'the ended ones', 'GET', `/app/offers?status=ended&q=${S}&limit=50`);
    flow.expectValue('ended', IDS, endedYesterday);
    await flow.expect(
      200,
      'the scheduled ones',
      'GET',
      `/app/offers?status=scheduled&q=${S}&limit=50`,
    );
    flow.expectValue('scheduled', IDS, startsTomorrow);
  });

  it('an offering made inactive under a live offer: the offer reads and pauses; naming it again is refused', async () => {
    const both = await offer('Both', calendarDay(fixture, -1), calendarDay(fixture, 10), [
      peel,
      laser,
    ]);
    await flow.expect(200, 'laser made inactive', 'PATCH', `/app/offerings/${laser}`, {
      is_active: false,
    });

    await flow.expect(200, 'the offer still reads', 'GET', `/app/offers/${both}`);
    flow.expectValue(
      'live, both offerings still named',
      '[.data.status, (.data.offering_ids | length)] | map(tostring) | join(",")',
      'live,2',
    );
    await flow.expect(200, 'it can still be paused', 'PATCH', `/app/offers/${both}`, {
      is_active: false,
    });
    flow.expectValue('paused', '.data.status', 'paused');
    await flow.expect(200, 'and renamed', 'PATCH', `/app/offers/${both}`, {
      name: `Both renamed ${S}`,
    });
    await flow.expect(400, 'a save naming the inactive one again', 'PATCH', `/app/offers/${both}`, {
      offering_ids: [peel, laser],
    });
    flow.expectValue(
      'the inactive offering: field',
      '[.error.errors[].field] | join(",")',
      'offering_ids',
    );
    await flow.expect(200, 'a save that drops it', 'PATCH', `/app/offers/${both}`, {
      offering_ids: [peel],
      is_active: true,
    });
    flow.expectValue(
      'live on peel alone',
      '[.data.status, .data.offering_ids[0]] | join(",")',
      `live,${peel}`,
    );
    await flow.expect(400, 'a new offer on the inactive one', 'POST', '/app/offers', {
      name: `On laser ${S}`,
      value: 10,
      offering_ids: [laser],
    });
  });
});
