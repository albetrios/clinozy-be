import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/** An appointment's statuses (A5). */
const STATUSES = [
  'scheduled',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
] as const;
type Status = (typeof STATUSES)[number];

/**
 * The lifecycle as the spec states it (routes-final 6, A5, A10, A11) — the oracle this suite holds
 * the code to: each action and the statuses it may start from. Every other pair is a 409
 * `transition_not_allowed`.
 */
const ALLOWED_FROM: Readonly<Record<string, readonly Status[]>> = {
  confirm: ['scheduled'],
  'check-in': ['scheduled', 'confirmed'],
  complete: ['checked_in'],
  'no-show': ['scheduled', 'confirmed'],
  cancel: ['scheduled', 'confirmed'],
  reinstate: ['cancelled'],
  'undo-check-in': ['checked_in'],
  stage: ['checked_in'],
  pause: ['checked_in'],
  resume: ['checked_in'],
};

/** The body each action needs. */
const BODIES: Readonly<Record<string, unknown>> = {
  cancel: { cancel_reason: 'patient_asked' },
  stage: { visit_stage: 'with_doctor' },
};

/**
 * The appointment status machine, every action from every status (task AP3,
 * docs/reviews/launch-confidence-plan-2026-10-09.md): 10 actions × 6 statuses. A pair the spec
 * forbids is a 409 `transition_not_allowed`; a pair it allows is never refused for its status (it
 * may still meet a rule of its own — a check-in before the day is `appointment_not_due`). The
 * booking is put in each status directly, so each pair starts from a clean state.
 */
describe('Appointments — the status machine (A5)', () => {
  const S = String(Date.now());
  const digits = `8${S.slice(-7)}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let appointment = '';

  /**
   * Puts the booking in `status`, with the fields that status carries (the table's checks); a
   * checked-in visit is running unless `paused`.
   */
  async function setStatus(status: Status, paused = false): Promise<void> {
    const checkedIn = status === 'checked_in' || status === 'completed';
    const onFloor = status === 'checked_in';
    await operatorQuery`
      UPDATE app.appointments SET
        status = ${status},
        checked_in_at = ${checkedIn ? new Date().toISOString() : null},
        completed_at = ${status === 'completed' ? new Date().toISOString() : null},
        visit_stage = ${onFloor ? 'waiting' : null},
        visit_stage_changed_at = ${onFloor ? new Date().toISOString() : null},
        visit_paused_at = ${onFloor && paused ? new Date().toISOString() : null},
        cancel_reason = ${status === 'cancelled' ? 'patient_asked' : null},
        cancel_note = NULL
      WHERE public_id = ${appointment}
    `;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    flow.as('owner');
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Lata',
      last_name: `l${S}`,
      phones: [{ phone: `+91${digits}01`, is_primary: true }],
    });
    const contact = flow.last('.data.id');
    const timeZone = fixture.organization.timezone;
    let workDay = '';
    for (let offset = 3; workDay === '' && offset < 10; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      if (new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) !== 'Sun') {
        workDay = new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
      }
    }
    await flow.expect(200, 'a booking', 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: fixture.branches.vesu,
      doctor_membership_id: fixture.members.doctor.membershipPublicId,
      appointment_date: workDay,
      start_time: '12:00',
      service_label: 'Consultation',
    });
    appointment = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  const pairs = Object.keys(ALLOWED_FROM).flatMap((action) =>
    STATUSES.map((status) => [action, status] as const),
  );

  it.each(pairs)('%s from %s', async (action, status) => {
    // Resume needs a paused visit, pause a running one — their own state, not the status
    await setStatus(status, action === 'resume');
    const answer = await flow.call(
      'POST',
      `/app/appointments/${appointment}/${action}`,
      BODIES[action],
    );
    const reason = (answer.body as { error?: { reason?: string } } | null)?.error?.reason;
    if (ALLOWED_FROM[action]?.includes(status)) {
      expect(reason, `${action} from ${status} is allowed (A5)`).not.toBe('transition_not_allowed');
      expect(answer.status, `${action} from ${status}`).not.toBe(500);
    } else {
      expect(answer.status, `${action} from ${status} is not allowed (A5)`).toBe(409);
      expect(reason).toBe('transition_not_allowed');
    }
  });

  it('pause and resume toggle, and the stage only moves forward (A10, A11)', async () => {
    await setStatus('checked_in', true);
    const path = `/app/appointments/${appointment}`;
    await flow.expect(409, 'paused twice', 'POST', `${path}/pause`);
    await flow.expect(200, 'resume', 'POST', `${path}/resume`);
    await flow.expect(409, 'resume a running visit', 'POST', `${path}/resume`);
    await flow.expect(200, 'pause', 'POST', `${path}/pause`);
    await flow.expect(200, 'forward to treatment', 'POST', `${path}/stage`, {
      visit_stage: 'treatment',
    });
    await flow.expect(409, 'back to the doctor', 'POST', `${path}/stage`, {
      visit_stage: 'with_doctor',
    });
    flow.expectValue('why', '.error.reason', 'transition_not_allowed');
    await flow.expect(
      409,
      'undo a check-in once the visit started',
      'POST',
      `${path}/undo-check-in`,
    );
    flow.expectValue('started: why', '.error.reason', 'visit_started');
  });
});
