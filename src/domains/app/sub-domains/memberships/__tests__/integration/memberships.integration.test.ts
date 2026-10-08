import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { MEMBERSHIP_SAVED_VIEWS_PER_LIST_MAX } from '@/domains/app/sub-domains/memberships/membership-saved-views/membership-saved-views.constants.js';

/**
 * Sub-domain 2, the app's memberships (routes-final §2.A, §2.F–§2.G, launch ROUTE #127): the team
 * as every member reads it (the person pickers and the member directory), a member's own
 * preferences (pinned sections, theme, branches, patient-file pins, recent picks) and their saved
 * views per list — one flow over the fixture organization.
 */
describe('App memberships — integration (routes-final §2)', () => {
  const FIELDS = '[.error.errors[].field] | join(",")';
  const REASON = '.error.reason';
  const IDS = '[.data[].id] | join(",")';
  const PREFERENCES = '/app/memberships/me/preferences';
  const SAVED_VIEWS = '/app/memberships/me/saved-views';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
  });

  afterAll(async () => {
    await app.close();
  });

  it('2.A the team (route 1)', async () => {
    const { members, roles, branches } = fixture;
    flow.as('front_desk');
    await flow.expect(200, 'every member reads the team', 'GET', '/app/memberships?limit=100');
    flow.expectValue('the owner and the nine roles', '.data | length', 9);
    flow.expectValue(
      'the slim picker shape (T5): ids, roles, branches, active',
      '[.data[] | ((.id | startswith("mem_")) and (.role_ids | type) == "array" and (.branch_ids | type) == "array" and .is_active)] | all',
      'true',
    );
    flow.expectValue(
      'no phone, hours or commission',
      '[.data[] | (has("phone") or has("work_starts_at") or has("commission_percent"))] | any',
      'false',
    );
    await flow.expect(
      200,
      "a role's members",
      'GET',
      `/app/memberships?role_id=${roles.therapist}`,
    );
    flow.expectValue('the therapist', IDS, members.therapist.membershipPublicId);
    await flow.expect(
      200,
      'who works at Adajan',
      'GET',
      `/app/memberships?branch_id=${branches.adajan}`,
    );
    // The owner made both branches, and the branch creator gets access (D10); the others work at Vesu.
    flow.expectValue('the owner only', IDS, members.owner.membershipPublicId);
    await flow.expect(
      200,
      'resolve given ids',
      'GET',
      `/app/memberships?ids=${members.doctor.membershipPublicId},${members.pharmacist.membershipPublicId}`,
    );
    flow.expectValue(
      'both, in name order',
      '[.data[].id] | sort | join(",")',
      [members.doctor.membershipPublicId, members.pharmacist.membershipPublicId].sort().join(','),
    );
    await flow.expect(200, 'one at a time', 'GET', '/app/memberships?limit=1');
    flow.expectValue('a next page', '.meta.pagination.next != null', 'true');
    await flow.expect(
      200,
      'an unknown role matches nobody',
      'GET',
      '/app/memberships?role_id=rol_000000000000000000000',
    );
    flow.expectValue('none', '.data | length', 0);
    await flow.expect(400, 'an unknown filter', 'GET', '/app/memberships?status=active');
    await flow.expect(
      400,
      'an id longer than any public id',
      'GET',
      `/app/memberships?role_id=rol_${'a'.repeat(25)}`,
    );
  });

  it('2.F my preferences (routes 2–3)', async () => {
    flow.as('therapist');
    await flow.expect(200, 'the defaults before any change', 'GET', PREFERENCES);
    flow.expectValue(
      'nothing saved yet: the launch defaults',
      '[.data.id, (.data.pinned_sections | join("+")), .data.theme, (.data.patient_file_pins | join("+")), (.data.branch_ids | length)] | map(tostring) | join(",")',
      'null,appointments+leads+patients+payments,light,clinical_notes+appointments+prescriptions+invoices,0',
    );
    await flow.expect(200, 'pin sections and go dark', 'PATCH', PREFERENCES, {
      pinned_sections: ['today', 'patients'],
      theme: 'dark',
      branch_ids: [fixture.branches.vesu],
      patient_file_pins: ['overview', 'images'],
      recent_picks: ['patients:offering_id:off_aaaaaaaaaaaaaaaaaaaaa'],
    });
    flow.expectValue(
      'saved: an id, the new values',
      '[(.data.id | startswith("upref_")), (.data.pinned_sections | join("+")), .data.theme, (.data.branch_ids | join("+")), (.data.patient_file_pins | join("+")), (.data.recent_picks | length)] | map(tostring) | join(",")',
      `true,today+patients,dark,${fixture.branches.vesu},overview+images,1`,
    );
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(200, 'read them back', 'GET', PREFERENCES);
    flow.expectValue('dark', '.data.theme', 'dark');
    await flow.expect(400, 'a branch the member cannot see', 'PATCH', PREFERENCES, {
      branch_ids: [fixture.branches.adajan],
    });
    flow.expectValue('not visible: field', FIELDS, 'branch_ids');
    await flow.expect(400, 'an unknown section', 'PATCH', PREFERENCES, {
      pinned_sections: ['nowhere'],
    });
    await flow.expect(400, 'a section twice', 'PATCH', PREFERENCES, {
      pinned_sections: ['patients', 'patients'],
    });
    await flow.expect(400, 'an unknown theme', 'PATCH', PREFERENCES, { theme: 'blue' });
    await flow.expect(400, 'a recent pick without its parts', 'PATCH', PREFERENCES, {
      recent_picks: ['patients'],
    });
    await flow.expect(400, 'a change with nothing in it', 'PATCH', PREFERENCES, {});
    await flow.expect(400, 'an unknown field', 'PATCH', PREFERENCES, { colour: 'red' });
    await flow.expect(409, 'a change over a newer one', 'PATCH', PREFERENCES, {
      theme: 'system',
      expected_updated_at: '2020-01-01T00:00:00Z',
    });
    flow.expectValue('stale: why', REASON, 'record_changed');
    await flow.expect(200, 'a change on the latest', 'PATCH', PREFERENCES, {
      theme: 'system',
      expected_updated_at: updatedAt,
    });
    flow.expectValue('system', '.data.theme', 'system');

    // Each member's own: the doctor still has the defaults.
    flow.as('doctor');
    await flow.expect(200, "another member's preferences", 'GET', PREFERENCES);
    flow.expectValue(
      'still the defaults',
      '[.data.id, .data.theme] | map(tostring) | join(",")',
      'null,light',
    );
  });

  it('2.G my saved views (routes 4–8)', async () => {
    flow.as('front_desk');
    await flow.expect(200, 'save a view on the leads list', 'POST', SAVED_VIEWS, {
      list_key: 'leads',
      label: 'Hot leads',
      filters: { status: 'new' },
      hidden_columns: ['source'],
    });
    const hotLeads = flow.last('.data.id');
    flow.expectValue(
      'saved: list, label, filters, hidden columns',
      '[.data.list_key, .data.label, .data.filters.status, (.data.hidden_columns | join("+"))] | join(",")',
      'leads,Hot leads,new,source',
    );
    await flow.expect(409, 'the same label on the same list', 'POST', SAVED_VIEWS, {
      list_key: 'leads',
      label: 'Hot leads',
      filters: {},
    });
    flow.expectValue('taken: why', REASON, 'view_exists');
    await flow.expect(200, 'the same label on another list', 'POST', SAVED_VIEWS, {
      list_key: 'patients',
      label: 'Hot leads',
      filters: {},
    });
    const patientsView = flow.last('.data.id');
    await flow.expect(400, 'a filter the list does not take (U5)', 'POST', SAVED_VIEWS, {
      list_key: 'leads',
      label: 'Wrong filter',
      filters: { colour: 'red' },
    });
    flow.expectValue('not taken: field', FIELDS, 'filters');
    await flow.expect(400, 'an unknown list', 'POST', SAVED_VIEWS, {
      list_key: 'nowhere',
      label: 'X',
      filters: {},
    });
    await flow.expect(400, 'an empty label', 'POST', SAVED_VIEWS, {
      list_key: 'leads',
      label: ' ',
      filters: {},
    });
    await flow.expect(
      422,
      'save without X-Idempotency-Key',
      'POST',
      SAVED_VIEWS,
      { list_key: 'leads', label: 'No key', filters: {} },
      { idempotencyKey: false },
    );

    await flow.expect(200, 'my views on the leads list', 'GET', `${SAVED_VIEWS}?list_key=leads`);
    flow.expectValue('the one view', IDS, hotLeads);
    await flow.expect(200, 'all my views by label', 'GET', `${SAVED_VIEWS}?sort=label`);
    flow.expectValue('both', '.data | length', 2);
    await flow.expect(400, 'an unknown sort', 'GET', `${SAVED_VIEWS}?sort=filters`);
    await flow.expect(200, 'one view', 'GET', `${SAVED_VIEWS}/${hotLeads}`);
    await flow.expect(200, 'rename it', 'PATCH', `${SAVED_VIEWS}/${hotLeads}`, {
      label: 'New leads',
      filters: { status: 'contacted' },
    });
    flow.expectValue(
      'renamed, new filters, same list',
      '[.data.label, .data.filters.status, .data.list_key] | join(",")',
      'New leads,contacted,leads',
    );
    await flow.expect(400, 'its list never changes', 'PATCH', `${SAVED_VIEWS}/${hotLeads}`, {
      list_key: 'patients',
    });
    await flow.expect(
      400,
      'a change with nothing in it',
      'PATCH',
      `${SAVED_VIEWS}/${hotLeads}`,
      {},
    );
    await flow.expect(409, 'a change over a newer one', 'PATCH', `${SAVED_VIEWS}/${hotLeads}`, {
      label: 'Stale',
      expected_updated_at: '2020-01-01T00:00:00Z',
    });
    flow.expectValue('stale: why', REASON, 'record_changed');
    await flow.expect(404, 'a view not here', 'GET', `${SAVED_VIEWS}/msv_000000000000000000000`);

    // A member's views are their own (U6).
    flow.as('counsellor');
    await flow.expect(200, "another member's views", 'GET', SAVED_VIEWS);
    flow.expectValue('none', '.data | length', 0);
    await flow.expect(404, "another member's view", 'GET', `${SAVED_VIEWS}/${hotLeads}`);
    await flow.expect(
      404,
      "nor deletes another member's view",
      'DELETE',
      `${SAVED_VIEWS}/${hotLeads}`,
    );

    // At most twenty views per list.
    flow.as('counsellor');
    for (let index = 0; index < MEMBERSHIP_SAVED_VIEWS_PER_LIST_MAX; index += 1) {
      await flow.call('POST', SAVED_VIEWS, {
        list_key: 'appointments',
        label: `View ${String.fromCharCode(65 + index)}`,
        filters: {},
      });
    }
    await flow.expect(200, 'twenty views', 'GET', `${SAVED_VIEWS}?list_key=appointments&limit=100`);
    flow.expectValue('twenty', '.data | length', MEMBERSHIP_SAVED_VIEWS_PER_LIST_MAX);
    await flow.expect(409, 'a twenty-first view', 'POST', SAVED_VIEWS, {
      list_key: 'appointments',
      label: 'One too many',
      filters: {},
    });
    flow.expectValue('limit: why', REASON, 'view_limit');

    flow.as('front_desk');
    await flow.expect(204, 'delete a view', 'DELETE', `${SAVED_VIEWS}/${patientsView}`);
    await flow.expect(404, 'gone', 'GET', `${SAVED_VIEWS}/${patientsView}`);
  });
});
