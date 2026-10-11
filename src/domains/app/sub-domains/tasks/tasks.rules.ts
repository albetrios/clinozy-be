import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import {
  type BaseRecordRow,
  findMembershipIdOfUser,
  resolveRecordIds,
} from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordActionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { LeadsRepository } from '@/domains/app/sub-domains/leads/leads.repository.js';
import { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import { PatientCheckInsRepository } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.repository.js';
import { PATIENT_CHECK_IN_FEEL } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.constants.js';
import { patientFileValueLabel } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  organizationToday,
  writePatientFileActivity,
} from '@/domains/app/sub-domains/patients/patients.rules.js';
import {
  ConflictError,
  ForbiddenError,
  fieldValidationError,
  MISSING_PERMISSION_REASON,
  NotFoundError,
} from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  TASK_HAND_KIND_VALUES,
  TASK_HAND_OUTCOME_VALUES,
  TASK_KIND,
  TASK_NO_ANSWER_SNOOZE_HOURS,
  TASK_OUTCOME,
  TASK_OWNER_ROLE,
  TASK_PATIENT_OUTCOME_VALUES,
  TASK_RULE,
  TASK_RULE_OUTCOMES,
  TASK_STATUS,
  type TaskOutcome,
  type TaskRule,
} from './tasks.constants.js';
import { ReassignTaskDto, ResolveTaskDto, type ResolveTaskInput } from './tasks.dto.js';
import type { TasksRepository } from './tasks.repository.js';
import { openRuleTask, organizationClock, TASK_RECORD_LINK_VALUES } from './tasks.rule-tasks.js';
import { tasks } from './tasks.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';

const contactsRepository = new ContactsRepository();
const leadsRepository = new LeadsRepository();
const appointmentsRepository = new AppointmentsRepository();
const checkInsRepository = new PatientCheckInsRepository();

/** The score a "Doing well" check-in records — a Better day (D74). */
const DOING_WELL_SCORE = 8;

/** The follow-ups set on resolve, by their write context — set by the action, read by `decorate`. */
const nextTasks = new WeakMap<BaseRecordWriteContext, string>();

/** A task that is done takes no more actions (`409 transition_not_allowed`). */
function assertNotDone({ existing, action }: { existing: BaseRecordRow; action: string }): void {
  if (existing.status !== TASK_STATUS.DONE) return;
  throw new ConflictError('errors:recordTransitionNotAllowed', {
    action,
    status: String(existing.status),
  }).withReason('transition_not_allowed');
}

/** TK7, TK9: a rule task is never changed or deleted by hand (`409 rule_task`). */
function assertMadeByHand(existing: BaseRecordRow): void {
  if ((TASK_HAND_KIND_VALUES as readonly unknown[]).includes(existing.kind)) return;
  throw new ConflictError('errors:taskRuleTask').withReason('rule_task');
}

/**
 * D81 TASKS-M2: the outcomes a task offers — its rule's, or a task made by hand's — else a 400 on
 * `outcome` naming them (a feedback outcome on another task would write its effect there).
 */
function assertOutcomeOffered({
  existing,
  outcome,
}: {
  existing: BaseRecordRow;
  outcome: TaskOutcome;
}): void {
  const offered =
    existing.kind === TASK_KIND.RULE
      ? (TASK_RULE_OUTCOMES[existing.rule_key as TaskRule] ?? [])
      : TASK_HAND_OUTCOME_VALUES;
  if (offered.includes(outcome)) return;
  throw fieldValidationError({
    field: 'outcome',
    messageKey: 'errors:validation.taskOutcomeNotOffered',
    messageParams: { outcomes: offered.join(', ') },
  });
}

/**
 * D81 TASKS-M3: a task's action that moves its lead (a claim, a reassign) needs what moving the lead
 * itself needs — `lead:update` — else a 403 `missing_permission`.
 */
async function assertCanMoveLead(context: BaseRecordWriteContext): Promise<void> {
  if (await context.can(APP_PERMISSIONS.LEAD_UPDATE)) return;
  throw new ForbiddenError('errors:taskLeadNeedsPermission', {
    permission: APP_PERMISSIONS.LEAD_UPDATE,
  }).withReason(MISSING_PERMISSION_REASON);
}

/**
 * TK6: exactly one of a member and a role queue; a member must be active here and hold
 * `task:read` (400 `owner_membership_id`), and so must the role a queue names — a queue nobody can
 * see is refused the same way (400 `owner_role`, D83 (5), QA C6).
 */
async function assertOwner(options: {
  repository: TasksRepository;
  context: BaseRecordWriteContext;
  memberId: unknown;
  role: unknown;
  prefix?: string;
}): Promise<void> {
  const { memberId, role } = options;
  const field = (name: string) => `${options.prefix ?? ''}${name}`;
  const hasMember = memberId !== undefined && memberId !== null;
  const hasRole = role !== undefined && role !== null;
  if (hasMember === hasRole) {
    throw fieldValidationError({
      field: field(hasMember ? 'owner_role' : 'owner_membership_id'),
      messageKey: 'errors:validation.taskOwnerOrQueue',
    });
  }
  if (!hasMember) {
    const queueCanWork = await options.repository.roleQueueHolds({
      organizationId: options.context.organizationId,
      roleKey: String(role),
      code: APP_PERMISSIONS.TASK_READ,
    });
    if (!queueCanWork) {
      throw fieldValidationError({
        field: field('owner_role'),
        messageKey: 'errors:validation.taskQueueCannotWork',
      });
    }
    return;
  }
  const canWork = await options.repository.membershipHolds({
    organizationId: options.context.organizationId,
    membershipId: memberId as number,
    code: APP_PERMISSIONS.TASK_READ,
  });
  if (!canWork) {
    throw fieldValidationError({
      field: field('owner_membership_id'),
      messageKey: 'errors:validation.taskOwnerCannotWork',
    });
  }
}

/** A member public id → its internal id here (400 on `field` when it is no member). */
async function memberIdOf(options: {
  publicId: string | undefined;
  context: BaseRecordWriteContext;
  field: string;
}): Promise<number | undefined> {
  if (options.publicId === undefined) return undefined;
  const id = (
    await resolveRecordIds({
      table: memberships,
      organizationId: options.context.organizationId,
      publicIds: [options.publicId],
    })
  ).get(options.publicId);
  if (id === undefined) {
    throw fieldValidationError({
      field: options.field,
      messageKey: 'errors:validation.recordReferenceNotFound',
      messageParams: { id: options.publicId, label: 'team member' },
    });
  }
  return id;
}

/**
 * TK3, TK5: at most one record (400 on the second link), the person's (400 on the link when another
 * contact's); the task takes the record's person when none is sent, and its branch.
 */
async function linkRecord({
  values,
  repository,
}: {
  values: Record<string, unknown>;
  repository: TasksRepository;
}): Promise<void> {
  const links = TASK_RECORD_LINK_VALUES.filter((link) => typeof values[link] === 'number');
  if (links.length > 1) {
    throw fieldValidationError({
      field: links[1]!,
      messageKey: 'errors:validation.taskOneRecord',
    });
  }
  const link = links[0];
  if (link === undefined) return;
  const record = await repository.findRecordContext({ link, id: values[link] as number });
  if (
    record === null ||
    (typeof values.contact_id === 'number' && values.contact_id !== record.contactId)
  ) {
    throw fieldValidationError({
      field: link,
      messageKey: 'errors:validation.taskRecordNotContacts',
    });
  }
  values.contact_id ??= record.contactId;
  values.branch_id = record.branchId;
}

/** TK7: "Doing well" — a Better check-in for the task's patient, with its activity entry. */
async function logDoingWell(options: {
  task: BaseRecordRow;
  patientId: number;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { task, patientId, context } = options;
  const checkIn = await checkInsRepository.insert({
    organization_id: context.organizationId,
    patient_id: patientId,
    appointment_id: task.appointment_id ?? null,
    patient_treatment_id: task.patient_treatment_id ?? null,
    context: String(task.title).slice(0, 80),
    feel: PATIENT_CHECK_IN_FEEL.BETTER,
    score: DOING_WELL_SCORE,
    check_in_date: await organizationToday(context),
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
  await writePatientFileActivity({
    context,
    patientId,
    body: `Check-in logged: ${patientFileValueLabel(PATIENT_CHECK_IN_FEEL.BETTER)}, score ${DOING_WELL_SCORE}/10`,
    link: { patient_check_in_id: checkIn.id },
  });
}

/** 10.10: an `unhappy` feedback task opens a call-back — due 18:00 today, the visit's doctor. */
async function openUnhappyCallBack({
  task,
  context,
}: {
  task: BaseRecordRow;
  context: BaseRecordWriteContext;
}) {
  const { timezone } = await context.ports.organizationSettings(context.scope);
  const visit =
    typeof task.appointment_id === 'number'
      ? await appointmentsRepository.findById(task.appointment_id)
      : null;
  await openRuleTask({
    organizationId: context.organizationId,
    rule: TASK_RULE.CALL_BACK,
    title: 'Call back — the patient was unhappy',
    why: (task.note as string | null) ?? (task.result_text as string | null) ?? null,
    ownerMembershipId: (visit?.doctor_membership_id as number | null | undefined) ?? null,
    ownerRole: TASK_OWNER_ROLE.DOCTOR,
    contactId: (task.contact_id as number | null) ?? null,
    link: typeof task.appointment_id === 'number' ? { appointment_id: task.appointment_id } : {},
    branchId: (task.branch_id as number | null) ?? null,
    dueAt: organizationClock({ timeZone: timezone, days: 0, time: '18:00' }),
    priority: 'high',
    userId: context.userId,
  });
}

/** 10.10 "Claim it": a done `claim` task gives the lead to the caller, with a fresh hold. */
async function claimLeadOfTask({
  task,
  context,
}: {
  task: BaseRecordRow;
  context: BaseRecordWriteContext;
}) {
  if (typeof task.lead_id !== 'number') return;
  const membershipId = await findMembershipIdOfUser({
    organizationId: context.organizationId,
    userId: context.userId,
  });
  if (membershipId === null) return;
  await moveLeadOwner({ leadId: task.lead_id, membershipId, context });
}

/** TK8: a lead task's lead follows its owner — a member with a fresh hold, or the pool. */
async function moveLeadOwner(options: {
  leadId: number;
  membershipId: number | null;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { lead_hold_days: holdDays } = await options.context.ports.organizationSettings(
    options.context.scope,
  );
  await leadsRepository.update(
    options.leadId,
    {
      owner_membership_id: options.membershipId,
      held_until:
        options.membershipId === null ? null : new Date(Date.now() + holdDays * 86_400_000),
    },
    options.context.userId,
  );
}

/** TK7 "What's next": a follow-up for the same person and record, in the resolve's transaction. */
async function setNextTask(options: {
  task: BaseRecordRow;
  next: NonNullable<ResolveTaskInput['next']>;
  repository: TasksRepository;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { task, next, repository, context } = options;
  const ownerMembershipId = await memberIdOf({
    publicId: next.owner_membership_id,
    context,
    field: 'next.owner_membership_id',
  });
  await assertOwner({
    repository,
    context,
    memberId: ownerMembershipId,
    role: next.owner_role,
    prefix: 'next.',
  });
  const links = Object.fromEntries(
    TASK_RECORD_LINK_VALUES.map((link) => [link, task[link] ?? null]),
  );
  const created = await repository.insert({
    organization_id: context.organizationId,
    kind: TASK_KIND.FOLLOW_UP,
    title: next.title,
    why: next.note ?? null,
    owner_membership_id: ownerMembershipId ?? null,
    owner_role: next.owner_role ?? null,
    contact_id: task.contact_id ?? null,
    ...links,
    branch_id: task.branch_id ?? null,
    due_at: new Date(next.due_at),
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
  nextTasks.set(context, created.public_id);
}

/** The values a resolve writes — `no_answer` snoozes the task three hours, the rest close it. */
async function resolvedValues(options: {
  body: ResolveTaskInput;
  context: BaseRecordWriteContext;
}): Promise<Record<string, unknown>> {
  const { body, context } = options;
  const kept = { result_text: body.result_text ?? null, note: body.note ?? null };
  if (body.outcome === TASK_OUTCOME.NO_ANSWER) {
    return {
      ...kept,
      status: TASK_STATUS.SNOOZED,
      snoozed_until: new Date(Date.now() + TASK_NO_ANSWER_SNOOZE_HOURS * 3_600_000),
      snooze_label: 'No answer',
    };
  }
  return {
    ...kept,
    status: TASK_STATUS.DONE,
    outcome: body.outcome,
    resolved_at: new Date(),
    is_resolved_automatically: false,
    resolved_by_membership_id: await findMembershipIdOfUser({
      organizationId: context.organizationId,
      userId: context.userId,
    }),
    snoozed_until: null,
    snooze_label: null,
  };
}

/**
 * TK7: takes an outcome the task offers (D81 TASKS-M2) — its effect on the record (a Better
 * check-in, a call-back, a claimed lead — the claim needs `lead:update`, TASKS-M3), optionally the
 * next step — and answers with the task.
 */
async function resolveTask(input: BaseRecordActionInput): Promise<BaseRecordRow> {
  const { existing, context } = input;
  const repository = input.repository as TasksRepository;
  assertNotDone({ existing, action: 'resolve' });
  const body = parseWithSchema({ schema: ResolveTaskDto, data: input.input });
  assertOutcomeOffered({ existing, outcome: body.outcome });
  const claimsLead =
    body.outcome === TASK_OUTCOME.DONE &&
    existing.rule_key === TASK_RULE.CLAIM &&
    typeof existing.lead_id === 'number';
  if (claimsLead) await assertCanMoveLead(context);
  const patientId =
    typeof existing.contact_id === 'number'
      ? await repository.findPatientIdOfContact(existing.contact_id)
      : null;
  if (
    (TASK_PATIENT_OUTCOME_VALUES as readonly string[]).includes(body.outcome) &&
    patientId === null
  ) {
    throw fieldValidationError({
      field: 'outcome',
      messageKey: 'errors:validation.taskOutcomeNeedsPatient',
    });
  }
  const updated = await repository.update(
    existing.id,
    await resolvedValues({ body, context }),
    context.userId,
  );
  if (!updated) throw new NotFoundError('Task');
  if (body.outcome === TASK_OUTCOME.DOING_WELL && patientId !== null) {
    await logDoingWell({ task: updated, patientId, context });
  }
  if (body.outcome === TASK_OUTCOME.UNHAPPY && existing.rule_key === TASK_RULE.FEEDBACK) {
    await openUnhappyCallBack({ task: updated, context });
  }
  if (claimsLead) await claimLeadOfTask({ task: existing, context });
  if (body.next) await setNextTask({ task: updated, next: body.next, repository, context });
  return updated;
}

/**
 * TK8: gives a task to a member or a role queue — an owner-change row, and a lead task's lead
 * follows (sub-domain 5's owner and hold), so a lead task's reassign needs `lead:update` (D81
 * TASKS-M3).
 */
async function reassignTask(input: BaseRecordActionInput): Promise<BaseRecordRow> {
  const { existing, context } = input;
  const repository = input.repository as TasksRepository;
  assertNotDone({ existing, action: 'reassign' });
  const body = parseWithSchema({ schema: ReassignTaskDto, data: input.input });
  if (typeof existing.lead_id === 'number') await assertCanMoveLead(context);
  const memberId = await memberIdOf({
    publicId: body.owner_membership_id,
    context,
    field: 'owner_membership_id',
  });
  await assertOwner({ repository, context, memberId, role: body.owner_role });
  const toMember = memberId ?? null;
  const toRole = toMember === null ? (body.owner_role ?? null) : null;
  const fromMember = (existing.owner_membership_id as number | null) ?? null;
  const updated = await repository.update(
    existing.id,
    toMember === null
      ? { owner_membership_id: null, owner_role: toRole }
      : { owner_membership_id: toMember, owner_role: null },
    context.userId,
  );
  if (!updated) throw new NotFoundError('Task');
  await repository.insertOwnerChange({
    organizationId: context.organizationId,
    taskId: existing.id,
    from: {
      membershipId: fromMember,
      role: fromMember === null ? (existing.owner_role as string) : null,
    },
    to: { membershipId: toMember, role: toRole },
    changedByMembershipId: await findMembershipIdOfUser({
      organizationId: context.organizationId,
      userId: context.userId,
    }),
    userId: context.userId,
  });
  if (typeof existing.lead_id === 'number') {
    await moveLeadOwner({ leadId: existing.lead_id, membershipId: toMember, context });
  }
  return updated;
}

/** Every read: the person's summary, the latest owner changes, the follow-up a resolve set. */
async function decorateTasks(options: {
  outputs: Record<string, unknown>[];
  repository: TasksRepository;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { outputs, repository, context } = options;
  const contactIdOf = (output: Record<string, unknown>) =>
    (output.contact as { id: string } | null)?.id ?? null;
  const summaries = new Map(
    (
      await contactsRepository.findSummaries([
        ...new Set(outputs.flatMap((output) => contactIdOf(output) ?? [])),
      ])
    ).map((contact) => [contact.id, contact]),
  );
  const idsByPublicId = await resolveRecordIds({
    table: tasks,
    organizationId: context.organizationId,
    publicIds: outputs.map((output) => String(output.id)),
  });
  const changes = await repository.findOwnerChanges([...idsByPublicId.values()]);
  const next = nextTasks.get(context) ?? null;
  for (const output of outputs) {
    const contact = summaries.get(contactIdOf(output) ?? '');
    output.contact = contact
      ? {
          id: contact.id,
          name: [contact.first_name, contact.last_name].filter(Boolean).join(' '),
          primary_phone: contact.primary_phone,
          preference_tags: contact.preference_tags ?? [],
        }
      : null;
    const id = idsByPublicId.get(String(output.id));
    output.owner_changes = (id === undefined ? [] : (changes.get(id) ?? [])).map(
      ({ task_id: _task, created_at, ...change }) => ({
        ...change,
        created_at: created_at.toISOString(),
      }),
    );
    output.next_task_id = next;
  }
}

/**
 * The task rules (launch ROUTE #138, routes-final 10.A): a task made by hand, its owner and record,
 * what is changed or deleted by hand, the snooze, the outcomes and their effects, the next step,
 * the reassign, and what a page reads.
 *
 * @remarks
 * - **Algorithm:** a create is `manual`, goes to a member who can work tasks or a role queue (TK6),
 *   points at the person and at most one of their records — taking the record's person and branch
 *   (TK3, TK5). A rule task is never changed or deleted by hand (TK7, TK9). A snooze wants a future
 *   time. Resolve (TK7) takes an outcome the task offers ({@link TASK_RULE_OUTCOMES}, a task made
 *   by hand `done` or `no_answer` — D81 TASKS-M2): `no_answer` snoozes three hours; the rest close
 *   the task — `doing_well` logs a Better check-in, `unhappy` on a feedback task opens a call-back,
 *   `done` on a claim task claims the lead; "What's next" sets a follow-up. Reassign (TK8) writes an
 *   owner-change row and moves a lead task's lead. Moving a lead — the claim, a lead task's
 *   reassign — needs `lead:update` (TASKS-M3).
 * - **Failure modes:** `ValidationError` on `owner_membership_id`, `owner_role`, a record link,
 *   `snoozed_until`, `outcome` (not offered, or no patient file), `next.*`; `ForbiddenError`
 *   `missing_permission` (moving a lead without `lead:update`); `ConflictError` `rule_task`,
 *   `transition_not_allowed`.
 */
export function createTasksRules(repository: TasksRepository): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      values.kind = TASK_KIND.MANUAL;
      await assertOwner({
        repository,
        context,
        memberId: values.owner_membership_id,
        role: values.owner_role,
      });
      await linkRecord({ values, repository });
    },
    prepareUpdate: (_values, existing) => assertMadeByHand(existing),
    prepareRemove: (existing) => assertMadeByHand(existing),
    prepareTransition: (action, values) => {
      if (action !== 'snooze') return;
      if ((values.snoozed_until as Date).getTime() <= Date.now()) {
        throw fieldValidationError({
          field: 'snoozed_until',
          messageKey: 'errors:validation.taskSnoozeInPast',
        });
      }
    },
    actions: { resolve: resolveTask, reassign: reassignTask },
    decorate: (outputs, context) => decorateTasks({ outputs, repository, context }),
  };
}
