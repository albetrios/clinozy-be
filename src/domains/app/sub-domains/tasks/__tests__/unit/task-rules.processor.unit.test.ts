import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    findOrganization: vi.fn(),
    lockRun: vi.fn(),
    wakeSnoozed: vi.fn(),
    findRuleSwitches: vi.fn(),
    closeGoneTasks: vi.fn(),
    openTasks: vi.fn(),
    findDueClinozySteps: vi.fn(),
    queueClinozyMessage: vi.fn(),
    markBookingMessageQueued: vi.fn(),
    openRetargetLead: vi.fn(),
    closeTaskByClinozy: vi.fn(),
    findLapsedPatients: vi.fn(),
  },
  queueClinozyMessages: vi.fn(),
}));

vi.mock('@/domains/app/sub-domains/tasks/task-rules.repository.js', () => ({
  createWorkerTaskRulesRepository: () => mocks.repository,
}));
vi.mock('@/domains/app/sub-domains/tasks/task-rule-messages.repository.js', () => ({
  createWorkerTaskRuleMessagesRepository: () => ({}),
}));
vi.mock('@/domains/app/sub-domains/tasks/task-rule-conditions.repository.js', () => ({
  taskRuleSources: () => [
    { rule: 'confirm', canOpen: true },
    { rule: 'feedback', canOpen: true },
    { rule: 'gone_quiet', canOpen: true },
  ],
}));
vi.mock(
  '@/domains/app/sub-domains/tasks/workers/task-rules-messages.processor.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    queueClinozyMessages: mocks.queueClinozyMessages,
  }),
);
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';

const ORGANIZATION = 'org_aaaaaaaaaaaaaaaaaaaa1';

/** A due task the app handles (TK10). */
function step(overrides: Record<string, unknown>) {
  return {
    taskId: 1,
    rule: 'confirm',
    contactId: 5,
    firstName: 'Asha',
    branchId: 2,
    appointmentId: 9,
    invoiceId: null,
    visitDate: '12 Oct',
    visitTime: '10:30',
    reminderStatus: 'not_sent',
    invoiceNumber: null,
    dueAmount: null,
    ...overrides,
  };
}

/** One organization's rules run (TK4, TK10, D74, D78). */
describe('runTaskRulesJob', () => {
  const { repository } = mocks;

  beforeEach(() => {
    for (const method of Object.values(repository)) method.mockReset();
    mocks.queueClinozyMessages.mockReset().mockResolvedValue(2);
    repository.findOrganization.mockResolvedValue({
      id: 7,
      timeZone: 'Asia/Kolkata',
      reminderHour: 16,
      retargetAfterDays: 90,
    });
    repository.findLapsedPatients.mockResolvedValue([]);
    repository.wakeSnoozed.mockResolvedValue(1);
    repository.findRuleSwitches.mockResolvedValue(new Map());
    repository.closeGoneTasks.mockResolvedValue(1);
    repository.openTasks.mockResolvedValue(2);
    repository.findDueClinozySteps.mockResolvedValue([]);
  });

  it('wakes, closes and opens per rule, then queues the booking messages and receipts', async () => {
    expect(
      await runTaskRulesJob({ databaseHandle: {} as never, organizationPublicId: ORGANIZATION }),
    ).toEqual({
      wokenCount: 1,
      closedCount: 3,
      openedCount: 6,
      handledCount: 0,
      messageCount: 2,
      retargetCount: 0,
    });
    expect(mocks.queueClinozyMessages).toHaveBeenCalledOnce();
  });

  it("takes the organization's run lock before anything else (R3)", async () => {
    await runTaskRulesJob({ databaseHandle: {} as never, organizationPublicId: ORGANIZATION });

    expect(repository.lockRun).toHaveBeenCalledWith(7);
    expect(repository.lockRun.mock.invocationCallOrder[0]).toBeLessThan(
      repository.wakeSnoozed.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('a rule that is off opens nothing, but its tasks still close', async () => {
    repository.findRuleSwitches.mockResolvedValue(
      new Map([['feedback', { isOn: false, isAutomatic: false }]]),
    );

    const counts = await runTaskRulesJob({
      databaseHandle: {} as never,
      organizationPublicId: ORGANIZATION,
    });

    expect([counts.closedCount, counts.openedCount]).toEqual([3, 4]);
  });

  it('takes the step of the rules the app handles: a message, then done by the app', async () => {
    repository.findRuleSwitches.mockResolvedValue(
      new Map([
        ['confirm', { isOn: true, isAutomatic: true }],
        ['gone_quiet', { isOn: true, isAutomatic: true }],
      ]),
    );
    repository.findDueClinozySteps.mockResolvedValue([
      step({}),
      step({ taskId: 2, rule: 'gone_quiet', appointmentId: null }),
    ]);

    const counts = await runTaskRulesJob({
      databaseHandle: {} as never,
      organizationPublicId: ORGANIZATION,
    });

    expect(counts.handledCount).toBe(2);
    expect(repository.findDueClinozySteps.mock.calls[0]?.[0].rules).toEqual([
      'confirm',
      'gone_quiet',
    ]);
    expect(repository.queueClinozyMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 5,
        automationKind: 'booking_confirm',
      }),
    );
    expect(repository.markBookingMessageQueued).toHaveBeenCalledWith({
      appointmentId: 9,
      from: ['not_sent'],
      to: 'confirm_requested',
    });
    expect(repository.openRetargetLead).toHaveBeenCalledOnce();
    expect(repository.closeTaskByClinozy.mock.calls.map((call) => call[0])).toEqual([1, 2]);
  });

  it('D78: a confirm task whose booking was already asked closes without a second message', async () => {
    repository.findRuleSwitches.mockResolvedValue(
      new Map([['confirm', { isOn: true, isAutomatic: true }]]),
    );
    repository.findDueClinozySteps.mockResolvedValue([
      step({ reminderStatus: 'confirm_requested' }),
    ]);

    expect(
      (await runTaskRulesJob({ databaseHandle: {} as never, organizationPublicId: ORGANIZATION }))
        .handledCount,
    ).toBe(1);
    expect(repository.queueClinozyMessage).not.toHaveBeenCalled();
    expect(repository.closeTaskByClinozy).toHaveBeenCalledWith(1);
  });

  it('a step with nobody to message stays for a person', async () => {
    repository.findRuleSwitches.mockResolvedValue(
      new Map([['confirm', { isOn: true, isAutomatic: true }]]),
    );
    repository.findDueClinozySteps.mockResolvedValue([step({ contactId: null })]);

    expect(
      (await runTaskRulesJob({ databaseHandle: {} as never, organizationPublicId: ORGANIZATION }))
        .handledCount,
    ).toBe(0);
    expect(repository.closeTaskByClinozy).not.toHaveBeenCalled();
  });

  it('WC-17: opens a re-target lead for each lapsed patient — none twice', async () => {
    repository.findLapsedPatients.mockResolvedValue([
      { contactId: 5, branchId: 2 },
      { contactId: 6, branchId: null },
    ]);
    repository.openRetargetLead.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(
      (await runTaskRulesJob({ databaseHandle: {} as never, organizationPublicId: ORGANIZATION }))
        .retargetCount,
    ).toBe(1);
    expect(repository.findLapsedPatients).toHaveBeenCalledWith({
      organizationId: 7,
      timeZone: 'Asia/Kolkata',
      afterDays: 90,
    });
    expect(repository.openRetargetLead).toHaveBeenCalledWith({
      organizationId: 7,
      contactId: 5,
      branchId: 2,
      reason: 'No visit in 90 days',
    });
  });

  it('an organization that is gone runs nothing', async () => {
    repository.findOrganization.mockResolvedValue(null);

    expect(
      await runTaskRulesJob({ databaseHandle: {} as never, organizationPublicId: ORGANIZATION }),
    ).toEqual({
      wokenCount: 0,
      closedCount: 0,
      openedCount: 0,
      handledCount: 0,
      messageCount: 0,
      retargetCount: 0,
    });
    expect(repository.wakeSnoozed).not.toHaveBeenCalled();
    expect(repository.lockRun).not.toHaveBeenCalled();
  });
});
