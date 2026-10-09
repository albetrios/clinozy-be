import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { TASK_DONE_BY_CLINOZY } from '@/domains/app/sub-domains/tasks/tasks.constants.js';

/** The fifteen rules, in the Rules popover's order. */
const RULES = [
  'reply',
  'failed_message',
  'follow_up',
  'claim',
  'confirm',
  'arrive',
  'rebook',
  'feedback',
  'aftercare',
  'call_back',
  'next_visit',
  'gone_quiet',
  'payment_due',
  'settle_by',
  'medical_rep_visit',
] as const;

/**
 * Sub-domain 10, Tasks 10.A–10.B (routes-final §10, launch ROUTE #138): the rules' switches; tasks
 * added by hand and their life — the tabs, snooze, reassign with the lead moving, resolve with
 * what's next, delete and restore, the export; and the rules worker (TK4) — the tasks it opens once
 * per record, closes when their record changes, hides while a rule is off, wakes from a snooze, the
 * call-back a feedback action ends, and the step "Let the app handle" takes — one flow over the
 * fixture organization.
 * The worker runs in-process: {@link runTaskRulesJob} inside the organization's context, as one
 * job of the five-minute sweep would.
 */
describe('Tasks — integration (routes-final §10)', () => {
  const S = String(Date.now());
  const lastName = `k${S}`;
  const digits = `7${S.slice(-7)}`;
  const FIELDS = '[.error.errors[].field] | join(",")';
  const REASON = '.error.reason';
  const IDS = '[.data[].id] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let doctor = '';
  let frontDesk = '';
  let counsellor = '';
  let marketing = '';

  let asha = '';
  let bela = '';
  let ashaLead = '';
  let callLab = '';
  let priceList = '';
  let nextTask = '';

  /** Now plus `milliseconds`, as an ISO instant. */
  const instant = (milliseconds: number) => new Date(Date.now() + milliseconds).toISOString();
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  /** A `PUT /app/task-rule-settings` body: every rule on, by hand, then `change` applied to each. */
  function rules(
    change: (rule: { rule_key: string; is_on: boolean; is_automatic: boolean }) => void = () => {},
  ): Record<string, unknown> {
    return {
      rules: RULES.map((rule_key) => {
        const rule = { rule_key, is_on: true, is_automatic: false };
        change(rule);
        return rule;
      }),
    };
  }

  /** One run of the task rules for the fixture organization, now. */
  async function runTaskRules(): Promise<void> {
    const organizationPublicId = fixture.organization.publicId;
    await runOrganizationScopedWorkerJob({ organizationPublicId }, (databaseHandle) =>
      runTaskRulesJob(databaseHandle, organizationPublicId),
    );
  }

  /** The rule's tasks for a record (`filter`: `lead_id=…`), everyone's. */
  async function ruleTasks(rule: string, filter: string, tab = 'open'): Promise<void> {
    await flow.expect(
      200,
      `the ${rule} tasks (${tab})`,
      'GET',
      `/app/tasks?scope=everyone&tab=${tab}&rule_key=${rule}&${filter}`,
    );
  }

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    frontDesk = fixture.members.front_desk.membershipPublicId;
    counsellor = fixture.members.counsellor.membershipPublicId;
    marketing = fixture.members.marketing.membershipPublicId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('10.B task rule settings (routes 11–12)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'every rule on, by hand (TK10)',
      'PUT',
      '/app/task-rule-settings',
      rules(),
    );
    flow.expectValue(
      "the 15 rules, in the popover's order",
      '[.data[].rule_key] | join(",")',
      RULES.join(','),
    );
    flow.expectValue(
      'saved: ids, on, by hand',
      '[.data[] | ((.id | startswith("trs_")) and .is_on and (.is_automatic | not))] | all',
      'true',
    );
    flow.expectValue(
      'the app can handle four',
      '[.data[] | select(.can_be_automatic) | .rule_key] | join(",")',
      'confirm,feedback,gone_quiet,payment_due',
    );
    await flow.expect(400, "the app can't handle reply", 'PUT', '/app/task-rule-settings', {
      rules: [{ rule_key: 'reply', is_on: true, is_automatic: true }],
    });
    flow.expectValue('reply: field', FIELDS, 'rules/0/is_automatic');
    await flow.expect(400, 'a rule that went (onboarding)', 'PUT', '/app/task-rule-settings', {
      rules: [{ rule_key: 'onboarding', is_on: true, is_automatic: false }],
    });
    await flow.expect(400, 'no rules', 'PUT', '/app/task-rule-settings', { rules: [] });
    await flow.expect(200, 'read them back', 'GET', '/app/task-rule-settings');
    flow.expectValue('still 15, all on', '[.data[] | select(.is_on)] | length', 15);
    flow.as('front_desk');
    await flow.expect(200, 'the front desk sees the rules', 'GET', '/app/task-rule-settings');
    await flow.expect(
      403,
      "the front desk can't change them (organization:update)",
      'PUT',
      '/app/task-rule-settings',
      rules(),
    );
    flow.as('marketing');
    await flow.expect(403, 'marketing has no tasks (task:read)', 'GET', '/app/task-rule-settings');
  });

  it('10.A tasks — add, the tabs and the drawer (routes 1–3, 5)', async () => {
    flow.as('owner');
    asha = await person('Asha', '81');
    bela = await person('Bela', '82');
    await flow.expect(200, "Asha's lead", 'POST', '/app/leads', {
      contact_id: asha,
      branch_id: vesu,
    });
    ashaLead = flow.last('.data.id');

    flow.as('front_desk');
    await flow.expect(200, 'add a task to the front desk queue', 'POST', '/app/tasks', {
      title: `Call the lab ${lastName}`,
      due_at: instant(HOUR),
      owner_role: 'front_desk',
      contact_id: asha,
      lead_id: ashaLead,
      priority: 'high',
    });
    callLab = flow.last('.data.id');
    flow.expectValue(
      "manual, queued, the lead's branch and person (TK5, TK6)",
      '[(.data.id | startswith("task_")), .data.kind, .data.rule_key, .data.owner_role, .data.owner_membership_id, .data.status, .data.priority, .data.branch_id, .data.contact.id, .data.lead_id, .data.can_clinozy_handle, (.data.owner_changes | length)] | map(tostring) | join(",")',
      `true,manual,null,front_desk,null,open,high,${vesu},${asha},${ashaLead},false,0`,
    );
    await flow.expect(200, 'add one for the counsellor', 'POST', '/app/tasks', {
      title: `Send the price list ${lastName}`,
      due_at: instant(2 * HOUR),
      owner_membership_id: counsellor,
      contact_id: bela,
    });
    priceList = flow.last('.data.id');
    flow.expectValue(
      'the counsellor owns it',
      '[.data.owner_membership_id, .data.owner_role, .data.branch_id] | map(tostring) | join(",")',
      `${counsellor},null,null`,
    );
    await flow.expect(400, 'an owner and a queue', 'POST', '/app/tasks', {
      title: 'Both',
      due_at: instant(HOUR),
      owner_membership_id: frontDesk,
      owner_role: 'front_desk',
    });
    flow.expectValue('both: field', FIELDS, 'owner_role');
    await flow.expect(400, 'neither an owner nor a queue', 'POST', '/app/tasks', {
      title: 'Nobody',
      due_at: instant(HOUR),
    });
    flow.expectValue('neither: field', FIELDS, 'owner_membership_id');
    await flow.expect(400, "an owner who can't work tasks (TK6)", 'POST', '/app/tasks', {
      title: 'Marketing',
      due_at: instant(HOUR),
      owner_membership_id: marketing,
    });
    flow.expectValue("can't work: field", FIELDS, 'owner_membership_id');
    await flow.expect(400, "another person's lead (TK5)", 'POST', '/app/tasks', {
      title: 'Wrong lead',
      due_at: instant(HOUR),
      owner_role: 'front_desk',
      contact_id: bela,
      lead_id: ashaLead,
    });
    flow.expectValue("another's: field", FIELDS, 'lead_id');
    await flow.expect(400, 'an empty title', 'POST', '/app/tasks', {
      title: ' ',
      due_at: instant(HOUR),
      owner_role: 'front_desk',
    });
    flow.expectValue('title: field', FIELDS, 'body.title');
    await flow.expect(
      422,
      'add without X-Idempotency-Key',
      'POST',
      '/app/tasks',
      { title: 'No key', due_at: instant(HOUR), owner_role: 'front_desk' },
      { idempotencyKey: false },
    );
    flow.as('marketing');
    await flow.expect(403, "marketing can't add tasks", 'POST', '/app/tasks', {
      title: 'No',
      due_at: instant(HOUR),
      owner_role: 'front_desk',
    });

    // The tabs (TK3): mine and my roles' queues, or everyone's.
    flow.as('front_desk');
    await flow.expect(200, 'To do — mine and my queue', 'GET', `/app/tasks?q=${lastName}`);
    flow.expectValue("the front desk sees the queue's task only", IDS, callLab);
    flow.as('counsellor');
    await flow.expect(200, "the counsellor's To do", 'GET', `/app/tasks?q=${lastName}`);
    flow.expectValue('the counsellor sees their own', IDS, priceList);
    await flow.expect(200, "everyone's, by due", 'GET', `/app/tasks?q=${lastName}&scope=everyone`);
    flow.expectValue('both, earliest due first', IDS, `${callLab},${priceList}`);
    await flow.expect(200, 'by the person', 'GET', `/app/tasks?scope=everyone&contact_id=${bela}`);
    flow.expectValue("Bela's: the price list", IDS, priceList);
    await flow.expect(400, 'an unknown tab', 'GET', '/app/tasks?tab=later');

    flow.as('front_desk');
    await flow.expect(200, 'get the task (the drawer)', 'GET', `/app/tasks/${callLab}`);
    flow.expectValue(
      "the person's summary",
      '[.data.contact.name, (.data.contact.preference_tags | type), .data.next_task_id] | map(tostring) | join(",")',
      `Asha ${lastName},array,null`,
    );
    await flow.expect(200, 'change its title and priority', 'PATCH', `/app/tasks/${callLab}`, {
      title: `Call the lab again ${lastName}`,
      priority: 'normal',
    });
    flow.expectValue(
      'changed',
      '[.data.title, .data.priority] | join(",")',
      `Call the lab again ${lastName},normal`,
    );
    await flow.expect(400, 'a change with nothing in it', 'PATCH', `/app/tasks/${callLab}`, {});
    await flow.expect(
      409,
      'a change over a newer one (record_changed)',
      'PATCH',
      `/app/tasks/${callLab}`,
      { title: 'Stale', expected_updated_at: '2020-01-01T00:00:00Z' },
    );
    flow.expectValue('stale: why', REASON, 'record_changed');
    await flow.expect(404, 'a task not here', 'GET', '/app/tasks/task_000000000000000000000');
  });

  it('10.A tasks — snooze, reassign, resolve (routes 6–8)', async () => {
    flow.as('front_desk');
    // Snooze (TK7).
    await flow.expect(400, 'snooze into the past', 'POST', `/app/tasks/${callLab}/snooze`, {
      snoozed_until: instant(-HOUR),
    });
    flow.expectValue('past: field', FIELDS, 'snoozed_until');
    await flow.expect(200, 'snooze it till tomorrow', 'POST', `/app/tasks/${callLab}/snooze`, {
      snoozed_until: instant(DAY),
      snooze_label: 'Tomorrow',
    });
    flow.expectValue(
      'snoozed',
      '[.data.status, .data.snooze_label] | join(",")',
      'snoozed,Tomorrow',
    );
    await flow.expect(
      200,
      'the Snoozed tab',
      'GET',
      `/app/tasks?q=${lastName}&scope=everyone&tab=snoozed`,
    );
    flow.expectValue('it is there', IDS, callLab);

    // Reassign (TK8): an owner-change row; a lead's task moves the lead too.
    await flow.expect(200, 'give it to the counsellor', 'POST', `/app/tasks/${callLab}/reassign`, {
      owner_membership_id: counsellor,
    });
    flow.expectValue(
      "the counsellor's, from the queue, by the front desk",
      '[.data.owner_membership_id, .data.owner_role, .data.owner_changes[0].from_role, .data.owner_changes[0].to_membership_id, .data.owner_changes[0].changed_by_membership_id] | map(tostring) | join(",")',
      `${counsellor},null,front_desk,${counsellor},${frontDesk}`,
    );
    await flow.expect(200, 'the lead moved with it', 'GET', `/app/leads/${ashaLead}`);
    flow.expectValue(
      'the counsellor holds the lead',
      '[.data.owner_membership_id, (.data.held_until != null)] | map(tostring) | join(",")',
      `${counsellor},true`,
    );
    await flow.expect(400, 'a member and a queue', 'POST', `/app/tasks/${callLab}/reassign`, {
      owner_membership_id: frontDesk,
      owner_role: 'front_desk',
    });
    await flow.expect(400, 'to marketing', 'POST', `/app/tasks/${callLab}/reassign`, {
      owner_membership_id: marketing,
    });
    flow.expectValue('marketing: field', FIELDS, 'owner_membership_id');
    await flow.expect(
      200,
      'back to the front desk queue',
      'POST',
      `/app/tasks/${callLab}/reassign`,
      { owner_role: 'front_desk' },
    );
    flow.expectValue(
      'queued, two changes, newest first',
      '[.data.owner_membership_id, .data.owner_role, (.data.owner_changes | length), .data.owner_changes[0].from_membership_id] | map(tostring) | join(",")',
      `null,front_desk,2,${counsellor}`,
    );
    await flow.expect(200, 'the lead is back in the pool', 'GET', `/app/leads/${ashaLead}`);
    flow.expectValue(
      'no owner, no hold',
      '[.data.owner_membership_id, .data.held_until] | map(tostring) | join(",")',
      'null,null',
    );

    // Resolve (TK7) — an outcome, and what's next.
    await flow.expect(400, 'an unknown outcome', 'POST', `/app/tasks/${callLab}/resolve`, {
      outcome: 'maybe',
    });
    await flow.expect(
      400,
      'doing well needs a patient file',
      'POST',
      `/app/tasks/${callLab}/resolve`,
      { outcome: 'doing_well' },
    );
    flow.expectValue('no file: field', FIELDS, 'outcome');
    await flow.expect(
      200,
      'no answer — try again in 3 hours',
      'POST',
      `/app/tasks/${callLab}/resolve`,
      { outcome: 'no_answer', note: 'Engaged' },
    );
    flow.expectValue(
      'snoozed, No answer',
      '[.data.status, .data.snooze_label, .data.outcome] | map(tostring) | join(",")',
      'snoozed,No answer,null',
    );
    const [snooze] = await getOperatorSql()<{ hours: string }[]>`
      SELECT round(extract(epoch FROM snoozed_until - now()) / 3600)::text AS hours
      FROM app.tasks WHERE public_id = ${callLab}
    `;
    expect.soft(snooze?.hours, 'for 3 hours').toBe('3');
    await flow.expect(200, "done, with what's next", 'POST', `/app/tasks/${callLab}/resolve`, {
      outcome: 'done',
      result_text: 'Lab called',
      next: {
        title: `Collect the report ${lastName}`,
        due_at: instant(DAY),
        owner_role: 'front_desk',
        note: 'Ask for the PDF',
      },
    });
    flow.expectValue(
      'done by the front desk',
      '[.data.status, .data.outcome, .data.result_text, .data.resolved_by_membership_id, .data.is_resolved_automatically, (.data.next_task_id | startswith("task_"))] | map(tostring) | join(",")',
      `done,done,Lab called,${frontDesk},false,true`,
    );
    nextTask = flow.last('.data.next_task_id');
    await flow.expect(409, 'resolve it again', 'POST', `/app/tasks/${callLab}/resolve`, {
      outcome: 'done',
    });
    flow.expectValue('again: why', REASON, 'transition_not_allowed');
    await flow.expect(409, 'snooze a done task', 'POST', `/app/tasks/${callLab}/snooze`, {
      snoozed_until: instant(DAY),
    });
    await flow.expect(200, 'the follow-up', 'GET', `/app/tasks/${nextTask}`);
    flow.expectValue(
      'a follow-up for the same person and lead',
      '[.data.kind, .data.why, .data.contact.id, .data.lead_id, .data.owner_role, .data.status] | map(tostring) | join(",")',
      `follow_up,Ask for the PDF,${asha},${ashaLead},front_desk,open`,
    );
    await flow.expect(
      200,
      'the Done tab — resolved today',
      'GET',
      `/app/tasks?q=${lastName}&scope=everyone&tab=done`,
    );
    flow.expectValue('the lab call is done', IDS, callLab);
  });

  it('10.A tasks — delete, restore and the export (routes 4, 9, 10)', async () => {
    // Delete and restore (TK9) — tasks made by hand only.
    flow.as('front_desk');
    await flow.expect(
      403,
      "the front desk can't delete (task:delete)",
      'DELETE',
      `/app/tasks/${nextTask}?reason=not_needed`,
    );
    flow.as('owner');
    await flow.expect(400, 'delete without a reason', 'DELETE', `/app/tasks/${nextTask}`);
    await flow.expect(
      204,
      'delete the follow-up',
      'DELETE',
      `/app/tasks/${nextTask}?reason=not_needed`,
    );
    await flow.expect(404, 'it is gone', 'GET', `/app/tasks/${nextTask}`);
    await flow.expect(409, 'restore a live one', 'POST', `/app/tasks/${priceList}/restore`);
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(200, 'restore it', 'POST', `/app/tasks/${nextTask}/restore`);
    flow.expectValue('back, open', '.data.status', 'open');

    // The export (task:export).
    await flow.expect(200, 'the CSV', 'GET', `/app/tasks/exports?q=${lastName}&scope=everyone`);
    flow.as('front_desk');
    await flow.expect(
      403,
      "the front desk can't export",
      'GET',
      `/app/tasks/exports?q=${lastName}`,
    );
  });

  it('TK4 the rules worker', async () => {
    flow.as('owner');
    // Bela's lead with a follow-up date that has come, the counsellor's.
    await flow.expect(200, "Bela's lead, follow-up yesterday", 'POST', '/app/leads', {
      contact_id: bela,
      branch_id: vesu,
      owner_membership_id: counsellor,
      follow_up_at: instant(-DAY),
    });
    const belaLead = flow.last('.data.id');
    // Asha's booking tomorrow (moved there in the database — any weekday), still to confirm: the
    // first day from a month out the doctor works.
    let ashaVisit = '';
    for (let offset = 30; offset <= 44 && ashaVisit === ''; offset += 1) {
      const booked = await flow.call('POST', '/app/appointments', {
        contact_id: asha,
        branch_id: vesu,
        doctor_membership_id: doctor,
        appointment_date: calendarDay(fixture, offset),
        start_time: '11:00',
        service_label: 'Consultation',
      });
      if (booked.status === 200) ashaVisit = flow.last('.data.id');
    }
    expect(ashaVisit, 'book Asha').not.toBe('');
    const tomorrow = calendarDay(fixture, 1);
    await getOperatorSql()`
      UPDATE app.appointments SET appointment_date = ${tomorrow} WHERE public_id = ${ashaVisit}
    `;

    await runTaskRules();
    await ruleTasks('confirm', `appointment_id=${ashaVisit}`);
    flow.expectValue(
      'a Confirm task for the booking, the front desk queue',
      '[(.data | length), .data[0].kind, .data[0].title, .data[0].owner_role, .data[0].branch_id, .data[0].contact.id, .data[0].can_clinozy_handle] | map(tostring) | join(",")',
      `1,rule,Confirm Asha's visit,front_desk,${vesu},${asha},true`,
    );
    const confirmTask = flow.last('.data[0].id');
    await ruleTasks('follow_up', `lead_id=${belaLead}`);
    flow.expectValue(
      "a Follow-up task, the lead's owner",
      '[(.data | length), .data[0].title, .data[0].owner_membership_id, .data[0].priority] | map(tostring) | join(",")',
      `1,Follow up with Bela,${counsellor},normal`,
    );
    const followUpTask = flow.last('.data[0].id');
    await runTaskRules();
    await ruleTasks('confirm', `appointment_id=${ashaVisit}`);
    flow.expectValue('run again: still one (TK4)', '.data | length', 1);

    // A rule's task is never changed or deleted by hand (TK7, TK9).
    await flow.expect(409, "change a rule's task", 'PATCH', `/app/tasks/${confirmTask}`, {
      title: 'Mine now',
    });
    flow.expectValue('rule task: why', REASON, 'rule_task');
    await flow.expect(
      409,
      "delete a rule's task",
      'DELETE',
      `/app/tasks/${confirmTask}?reason=not_needed`,
    );

    // Its record changes — the task closes itself, done by the app.
    await flow.expect(
      200,
      "confirm Asha's booking",
      'POST',
      `/app/appointments/${ashaVisit}/confirm`,
    );
    await runTaskRules();
    await flow.expect(200, 'the Confirm task', 'GET', `/app/tasks/${confirmTask}`);
    flow.expectValue(
      'closed by the app',
      '[.data.status, .data.outcome, .data.result_text, .data.is_resolved_automatically, .data.resolved_by_membership_id] | map(tostring) | join(",")',
      `done,done,${TASK_DONE_BY_CLINOZY},true,null`,
    );

    // A snoozed task wakes when its time comes (its time moved to the past in the database).
    flow.as('counsellor');
    await flow.expect(
      200,
      'snooze the follow-up for a moment',
      'POST',
      `/app/tasks/${followUpTask}/snooze`,
      { snoozed_until: instant(60_000) },
    );
    await getOperatorSql()`
      UPDATE app.tasks SET snoozed_until = now() - interval '1 second'
      WHERE public_id = ${followUpTask}
    `;
    await runTaskRules();
    await flow.expect(200, 'the follow-up task', 'GET', `/app/tasks/${followUpTask}`);
    flow.expectValue(
      'awake (TK7)',
      '[.data.status, .data.snoozed_until] | map(tostring) | join(",")',
      'open,null',
    );

    // A rule that is off hides its open tasks and opens none; on again, they show.
    flow.as('owner');
    await flow.expect(
      200,
      'turn follow-up off',
      'PUT',
      '/app/task-rule-settings',
      rules((rule) => {
        if (rule.rule_key === 'follow_up') rule.is_on = false;
      }),
    );
    await flow.expect(
      200,
      'hidden from To do',
      'GET',
      `/app/tasks?scope=everyone&lead_id=${belaLead}`,
    );
    flow.expectValue('none shown', '.data | length', 0);
    await flow.expect(200, 'move the follow-up a week out', 'PATCH', `/app/leads/${belaLead}`, {
      follow_up_at: instant(7 * DAY),
    });
    await runTaskRules();
    const [closedFollowUp] = await getOperatorSql()<{ state: string }[]>`
      SELECT t.status || ',' || t.result_text AS state FROM app.tasks t
      WHERE t.public_id = ${followUpTask}
    `;
    expect
      .soft(closedFollowUp?.state, "an off rule's task still closes when its record changes")
      .toBe(`done,${TASK_DONE_BY_CLINOZY}`);
    await flow.expect(
      200,
      'the follow-up date is back to yesterday',
      'PATCH',
      `/app/leads/${belaLead}`,
      { follow_up_at: instant(-DAY) },
    );
    await runTaskRules();
    const [openFollowUps] = await getOperatorSql()<{ count: string }[]>`
      SELECT count(*)::text AS count FROM app.tasks t JOIN app.leads l ON l.id = t.lead_id
      WHERE l.public_id = ${belaLead} AND t.rule_key = 'follow_up' AND t.status <> 'done'
    `;
    expect.soft(openFollowUps?.count, 'off: no new task').toBe('0');
    await flow.expect(200, 'turn it on', 'PUT', '/app/task-rule-settings', rules());
    await runTaskRules();
    await ruleTasks('follow_up', `lead_id=${belaLead}`);
    flow.expectValue('on: a fresh one', '.data | length', 1);

    // A call-back closes when a feedback action is logged (8 TR4).
    await flow.expect(200, "Asha's patient file", 'POST', '/app/patients', {
      contact_id: asha,
      home_branch_id: vesu,
    });
    const ashaFile = flow.last('.data.id');
    await flow.expect(200, 'a worse check-in', 'POST', `/app/patients/${ashaFile}/check-ins`, {
      feel: 'worse',
      score: 3,
      context: 'Phone call',
    });
    const worse = flow.last('.data.id');
    await ruleTasks('call_back', `contact_id=${asha}`);
    flow.expectValue(
      'a call-back for the doctor queue, high',
      '[(.data | length), .data[0].owner_role, .data[0].priority, .data[0].patient_check_in_id] | map(tostring) | join(",")',
      `1,doctor,high,${worse}`,
    );
    const callBack = flow.last('.data[0].id');
    await flow.expect(
      200,
      'the doctor called',
      'POST',
      `/app/patients/${ashaFile}/check-ins/${worse}/actions`,
      { action: 'doctor_called' },
    );
    await runTaskRules();
    await flow.expect(200, 'the call-back', 'GET', `/app/tasks/${callBack}`);
    flow.expectValue(
      'closed by the app',
      '[.data.status, .data.result_text] | join(",")',
      `done,${TASK_DONE_BY_CLINOZY}`,
    );

    // "Let the app handle" a payment due (TK10): the reminder goes out on WhatsApp, the task closes.
    await flow.expect(200, 'offering Consult', 'POST', '/app/offerings', {
      name: `Tasks consult ${S}`,
      category: 'consultation',
      price: 500,
    });
    const consult = flow.last('.data.id');
    await flow.expect(
      200,
      "Bela's patient file (a clinic bill needs one)",
      'POST',
      '/app/patients',
      {
        contact_id: bela,
        home_branch_id: vesu,
      },
    );
    await flow.expect(
      200,
      'let the app handle payment due',
      'PUT',
      '/app/task-rule-settings',
      rules((rule) => {
        if (rule.rule_key === 'payment_due') rule.is_automatic = true;
      }),
    );
    const twoDaysAgo = calendarDay(fixture, -2);
    await flow.expect(200, 'bill Bela, unpaid, two days ago', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: bela,
      invoice_date: twoDaysAgo,
      items: [{ offering_id: consult, quantity: 1 }],
    });
    const belaBillNumber = flow.last('.data.invoice_number');
    await runTaskRules();
    await ruleTasks('payment_due', `contact_id=${bela}`, 'done');
    flow.expectValue(
      'the app took it',
      '[(.data | length), .data[0].result_text, .data[0].is_resolved_automatically, (.data[0].invoice_id | startswith("inv"))] | map(tostring) | join(",")',
      `1,${TASK_DONE_BY_CLINOZY},true,true`,
    );
    await flow.expect(
      200,
      "Bela's stream",
      'GET',
      `/app/contacts/${bela}/activities?order=desc&limit=1`,
    );
    flow.expectValue(
      'a queued reminder from the app',
      `[.data[0].type, .data[0].direction, .data[0].delivery_status, .data[0].author_membership_id, (.data[0].body | contains("is still due on invoice ${belaBillNumber}"))] | map(tostring) | join(",")`,
      'whatsapp,sent,queued,null,true',
    );
    await flow.expect(200, 'by hand again', 'PUT', '/app/task-rule-settings', rules());
    await flow.expect(200, 'bill Asha, unpaid, two days ago', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: asha,
      invoice_date: twoDaysAgo,
      items: [{ offering_id: consult, quantity: 1 }],
    });
    const ashaBill = flow.last('.data.id');
    const ashaDue = Number(flow.last('.data.due_amount'));
    await runTaskRules();
    await ruleTasks('payment_due', `contact_id=${asha}`);
    flow.expectValue(
      'by hand: open in the front desk queue',
      '[(.data | length), .data[0].owner_role, .data[0].status] | map(tostring) | join(",")',
      '1,front_desk,open',
    );
    const paymentTask = flow.last('.data[0].id');
    await flow.expect(200, 'Asha pays it all', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: asha,
      invoice_id: ashaBill,
      splits: [{ mode: 'cash', amount: ashaDue }],
    });
    await runTaskRules();
    await flow.expect(200, 'the payment task', 'GET', `/app/tasks/${paymentTask}`);
    flow.expectValue(
      'nothing due: closed by the app',
      '[.data.status, .data.result_text] | join(",")',
      `done,${TASK_DONE_BY_CLINOZY}`,
    );
  });
});
