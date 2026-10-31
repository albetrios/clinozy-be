/**
 * Demo clinic seed — a real-looking skin & hair clinic with two branches, five staff who can sign
 * in, two dozen patients and six weeks of visits, bills, notes, enquiries and tasks, a medical store
 * and a procedure room's stock, so every room of the app has something to show. The story is `demo-clinic.plan.ts` (pure, seeded Faker); this
 * file writes it through each domain's seed helpers. Orchestration only.
 *
 * Usage: pnpm db:seed:demo-clinic [--fresh]
 *
 * - The clinic's name, people and addresses come from `fakerEN_IN` with the `SEED` env (default
 *   12345), so a seed gives the same clinic every time; emails stay on `example.com`.
 * - Idempotent: a clinic already seeded under the same slug is left alone. `--fresh` deletes it
 *   and seeds it again around today (local databases only, like the bulk seed).
 * - `demo@example.com` joins it as an Admin when that user exists (`pnpm db:seed:full` makes it).
 */
import '@/shared/config/load-env-files.js';
import '@/scripts/seed/seed-runtime-url.js';
import { fakerEN_IN } from '@faker-js/faker';
import { closeDatabase } from './helpers.js';
import { assertBulkSeedAllowed } from './production-guard.js';
import {
  buildDemoClinicPlan,
  demoCase,
  demoMachineFor,
  demoOffering,
  type DemoClinicPlan,
  type DemoMoment,
  type DemoStaffKey,
} from './demo-clinic.plan.js';
import {
  DEMO_MACHINES,
  DEMO_MANUFACTURERS,
  DEMO_OFFERINGS,
  DEMO_ROOMS,
  type DemoManufacturerKey,
  type DemoMedicineKey,
  type DemoStockItemKey,
  type DemoStockVendorKey,
  type DemoSupplierKey,
} from './demo-clinic.catalog.js';
import { demoMedicine, demoStockItem, momentKey } from './demo-clinic.stock.plan.js';
import { computeInvoiceAmounts } from '@/domains/app/sub-domains/billing/invoices/invoices.amounts.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import {
  calendarDateInTimeZone,
  clockTimeInTimeZone,
  instantInTimeZone,
} from '@/shared/utils/validation/record-fields.util.js';
import { WEEKDAY_VALUES } from '@/shared/constants/record-fields.constants.js';
import { ORGANIZATION_DEFAULT_TIMEZONE } from '@/domains/tenancy/sub-domains/organization/organization.constants.js';
import { provisionOrganizationWithOwner } from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';
import { seedPermissions } from '@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js';
import {
  deleteSeededOrganization,
  findSeededOrganizationId,
  seedMembership,
  seedMembershipAdditionalRole,
  seedOrganizationProfile,
  seedOrganizationSetupLive,
  seedRole,
} from '@/domains/tenancy/seed/tenancy.seed.js';
import { findSeededUserId, seedUser } from '@/domains/user/seed/user.seed.js';
import {
  seedBranch,
  seedBranchMember,
} from '@/domains/app/sub-domains/branches/seed/branches.seed.js';
import { seedBranchRoom } from '@/domains/app/sub-domains/branches/branch-rooms/seed/branch-rooms.seed.js';
import { seedBranchMachine } from '@/domains/app/sub-domains/branches/branch-machines/seed/branch-machines.seed.js';
import { seedOffering } from '@/domains/app/sub-domains/offerings/seed/offerings.seed.js';
import { seedContact } from '@/domains/app/sub-domains/contacts/seed/contacts.seed.js';
import { seedContactActivity } from '@/domains/app/sub-domains/contacts/contact-activities/seed/contact-activities.seed.js';
import { seedLead } from '@/domains/app/sub-domains/leads/seed/leads.seed.js';
import { seedPatient } from '@/domains/app/sub-domains/patients/seed/patients.seed.js';
import { seedAppointment } from '@/domains/app/sub-domains/appointments/seed/appointments.seed.js';
import { seedPatientClinicalNote } from '@/domains/app/sub-domains/patients/patient-clinical-notes/seed/patient-clinical-notes.seed.js';
import { seedPatientTreatment } from '@/domains/app/sub-domains/patients/patient-treatments/seed/patient-treatments.seed.js';
import { seedPatientCheckIn } from '@/domains/app/sub-domains/patients/patient-check-ins/seed/patient-check-ins.seed.js';
import { seedPatientReview } from '@/domains/app/sub-domains/patients/patient-reviews/seed/patient-reviews.seed.js';
import {
  seedInvoice,
  seedInvoicePaidAmount,
} from '@/domains/app/sub-domains/billing/invoices/seed/invoices.seed.js';
import { seedPayment } from '@/domains/app/sub-domains/billing/payments/seed/payments.seed.js';
import { seedTask } from '@/domains/app/sub-domains/tasks/seed/tasks.seed.js';
import { seedManufacturer } from '@/domains/app/sub-domains/medical/manufacturers/seed/manufacturers.seed.js';
import {
  seedSupplier,
  seedSupplierManufacturer,
} from '@/domains/app/sub-domains/medical/suppliers/seed/suppliers.seed.js';
import { seedSupplierCredit } from '@/domains/app/sub-domains/medical/suppliers/supplier-credits/seed/supplier-credits.seed.js';
import {
  seedMedicine,
  seedMedicineBatch,
  seedMedicineSupplierPrice,
} from '@/domains/app/sub-domains/medical/medicines/seed/medicines.seed.js';
import {
  seedMedicalPurchaseOrder,
  seedMedicalPurchaseOrderItem,
} from '@/domains/app/sub-domains/medical/medical-purchase-orders/seed/medical-purchase-orders.seed.js';
import {
  seedMedicalRep,
  seedMedicalRepManufacturer,
} from '@/domains/app/sub-domains/medical/medical-reps/seed/medical-reps.seed.js';
import { seedMedicalRepVisit } from '@/domains/app/sub-domains/medical/medical-reps/medical-rep-visits/seed/medical-rep-visits.seed.js';
import { seedMedicalSale } from '@/domains/app/sub-domains/medical/medical-sales/seed/medical-sales.seed.js';
import { seedStockVendor } from '@/domains/app/sub-domains/stock/stock-vendors/seed/stock-vendors.seed.js';
import { seedStockItem } from '@/domains/app/sub-domains/stock/stock-items/seed/stock-items.seed.js';
import { seedStockPurchase } from '@/domains/app/sub-domains/stock/stock-purchases/seed/stock-purchases.seed.js';
import { seedStockCount } from '@/domains/app/sub-domains/stock/stock-counts/seed/stock-counts.seed.js';
import { seedStockItemMovement } from '@/domains/app/sub-domains/stock/stock-item-movements/seed/stock-item-movements.seed.js';
import {
  quantityMilli,
  quantityText,
} from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.ledger.js';
import { MEDICAL_PURCHASE_ORDER_STAGE } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.constants.js';
import {
  PAYMENT_DIRECTION,
  PAYMENT_EXPENSE_CATEGORY,
  PAYMENT_KIND,
} from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';

const DEMO_EMAIL = 'demo@example.com';
const DEFAULT_SEED = 12_345;

/** What {@link runDemoClinicSeed} did. */
export interface DemoClinicSeedResult {
  name: string;
  slug: string;
  /** False when the clinic was already there and `fresh` was not asked for. */
  created: boolean;
}

/** Paise as the `numeric(12,2)` text a money column takes (`74800` → `748.00`). */
function rupeesText(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * A demo purchase line's GST (PG8): the medicine's rate, its rate GST-inclusive — the invoice
 * calculation, so the line's amount stays quantity × rate.
 */
function purchaseLineGst(line: {
  medicine: DemoMedicineKey;
  quantity: number;
  ratePaise: number;
}): {
  gstPercent: number;
  taxablePaise: number;
  gstPaise: number;
} {
  const { gstPercent } = demoMedicine(line.medicine);
  const [amounts] = computeInvoiceAmounts({
    lines: [
      {
        quantity: line.quantity,
        rate: line.ratePaise / 100,
        discountPercent: 0,
        gstPercent,
        isGstInclusive: true,
      },
    ],
    overallDiscount: 0,
  }).lines;
  return {
    gstPercent,
    taxablePaise: Math.round((amounts?.taxableAmount ?? 0) * 100),
    gstPaise: Math.round((amounts?.gstAmount ?? 0) * 100),
  };
}

/** A payment the shelves owe the ledger, written in the order it was paid. */
interface ShelfPayment {
  at: DemoMoment;
  write: () => Promise<void>;
}

/** The staff's ids once they exist: their logins and their memberships in the clinic. */
interface StaffIds {
  users: Record<DemoStaffKey, number>;
  memberships: Record<DemoStaffKey, number>;
}

/**
 * Seeds the demo clinic (see the file header): the staff's logins, the organization with its
 * clinic roles, the memberships, then every clinic record in one transaction scoped to the new
 * organization, and finally one run of the clinic's task rules (the open rule tasks are theirs). Does not manage the database connection — the CLI entry point below drains the
 * pool, so `full.ts` and a test can call it directly.
 *
 * @remarks
 * - **Idempotency:** the plan is deterministic for a `SEED`, so its slug is too; a live clinic with
 *   that slug is kept unless `fresh` is set, which deletes it (the foreign keys cascade) after
 *   {@link assertBulkSeedAllowed} confirms the database is local.
 * - **Failure modes:** the clinic records roll back together; the logins, organization and
 *   memberships written before them stay, and the next `--fresh` run replaces them.
 */
export async function runDemoClinicSeed(
  options: { fresh?: boolean; now?: Date } = {},
): Promise<DemoClinicSeedResult> {
  const timeZone = ORGANIZATION_DEFAULT_TIMEZONE;
  const now = options.now ?? new Date();
  fakerEN_IN.seed(Number(process.env.SEED) || DEFAULT_SEED);
  const plan = buildDemoClinicPlan({
    faker: fakerEN_IN,
    today: calendarDateInTimeZone({ timeZone, at: now }),
    now: clockTimeInTimeZone({ timeZone, at: now }),
  });

  const existing = await findSeededOrganizationId(plan.slug);
  if (existing !== null) {
    if (!options.fresh) {
      // A clinic seeded before the clinic setup shipped is set up too (feat-clinic-setup OSC7).
      await seedOrganizationSetupLive({ organization_id: existing });
      logger.info(
        { slug: plan.slug },
        'seed.demo-clinic: already seeded — run with --fresh to rebuild it around today',
      );
      return { name: plan.name, slug: plan.slug, created: false };
    }
    assertBulkSeedAllowed(process.env);
    await deleteSeededOrganization(existing);
    logger.info({ slug: plan.slug }, 'seed.demo-clinic: previous clinic deleted');
  }

  await seedPermissions();
  const userIds = {} as Record<DemoStaffKey, number>;
  for (const member of plan.staff) {
    const user = await seedUser({
      email: member.email,
      first_name: member.firstName,
      last_name: member.lastName,
      job_title: member.jobTitle,
      onboarding_completed_at: now,
    });
    if (!user) throw new Error(`seed.demo-clinic: failed to create ${member.email}`);
    userIds[member.key] = user.id;
  }
  const ownerId = userIds.owner;

  const { organization } = await provisionOrganizationWithOwner({
    name: plan.name,
    slug: plan.slug,
    type: 'TEAM',
    ownerUserId: ownerId,
  });
  await seedOrganizationProfile({
    organization_id: organization.id,
    specialties: ['skin', 'hair'],
    timezone: timeZone,
  });
  // The demo clinic is set up (feat-clinic-setup OSC7): its staff never meet the setup drawer.
  await seedOrganizationSetupLive({ organization_id: organization.id });

  // The provisioned clinic roles, by name (the upsert returns the existing row).
  const roleId = async (name: string): Promise<number> => {
    const role = await seedRole({
      organization_id: organization.id,
      name,
      is_system: true,
      created_by_user_id: ownerId,
    });
    if (!role) throw new Error(`seed.demo-clinic: role ${name} is missing`);
    return role.id;
  };
  const membershipIds = {} as Record<DemoStaffKey, number>;
  for (const member of plan.staff) {
    const membership = await seedMembership({
      user_id: userIds[member.key],
      organization_id: organization.id,
      role_id: await roleId(member.role),
      created_by_user_id: ownerId,
      tone: member.tone,
      phone: member.phone,
    });
    if (!membership) throw new Error(`seed.demo-clinic: failed to add ${member.email}`);
    membershipIds[member.key] = membership.id;
    if (member.alsoDoctor) {
      await seedMembershipAdditionalRole({
        membership_id: membership.id,
        role_id: await roleId('Doctor'),
        organization_id: organization.id,
        position: 1,
        created_by_user_id: ownerId,
      });
    }
  }

  const demoUserId = await findSeededUserId(DEMO_EMAIL);
  let demoMembershipId: number | null = null;
  if (demoUserId !== null) {
    const membership = await seedMembership({
      user_id: demoUserId,
      organization_id: organization.id,
      role_id: await roleId('Admin'),
      created_by_user_id: ownerId,
    });
    demoMembershipId = membership?.id ?? null;
  }

  await withAppDatabaseContext({
    scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: organization.public_id }),
    callback: () =>
      new DemoClinicWriter({
        plan,
        organizationId: organization.id,
        staff: { users: userIds, memberships: membershipIds },
        demo:
          demoUserId === null || demoMembershipId === null
            ? null
            : { userId: demoUserId, membershipId: demoMembershipId },
        timeZone,
        now,
      }).writeAll(),
  });

  // The rule tasks — aftercare calls, replies, confirmations, dues — as the app's own rules open
  // them, now rather than at the worker's next sweep (and without a worker running).
  const rules = await runOrganizationScopedWorkerJob({
    job: { organizationPublicId: organization.public_id },
    processor: (databaseHandle) =>
      runTaskRulesJob({ databaseHandle, organizationPublicId: organization.public_id }),
  });

  logger.info(
    {
      name: plan.name,
      slug: plan.slug,
      staff: plan.staff.map((member) => member.email),
      patients: plan.patients.length,
      appointments: plan.appointments.length,
      leads: plan.leads.length,
      invoices: plan.invoices.length,
      tasks: plan.tasks.length + rules.openedCount,
      medicines: plan.store.medicines.length,
      medicalSales: plan.store.sales.length,
      stockItems: plan.stock.items.length,
      stockMovements: plan.stock.movements.length,
    },
    'seed.demo-clinic: done',
  );
  return { name: plan.name, slug: plan.slug, created: true };
}

/**
 * Writes the plan's clinic records, one step per area, keeping each record's new id for the
 * steps after it; runs inside the new organization's database context.
 */
class DemoClinicWriter {
  private readonly plan: DemoClinicPlan;
  private readonly organization_id: number;
  private readonly staff: StaffIds;
  private readonly demo: { userId: number; membershipId: number } | null;
  private readonly timeZone: string;
  private readonly now: Date;
  private readonly ownerId: number;
  private readonly frontDeskId: number;
  private readonly branchIds = {} as Record<'main' | 'second', number>;
  private readonly roomIds = { main: [] as number[], second: [] as number[] };
  private readonly machineIds = {
    main: new Map<string, number>(),
    second: new Map<string, number>(),
  };
  private readonly offeringIds = new Map<string, number>();
  private readonly contactIds: number[] = [];
  private readonly leadIds: (number | null)[] = [];
  private readonly patientIds = new Map<number, number>();
  private readonly appointmentIds: number[] = [];
  private readonly treatmentIds: number[] = [];
  private readonly invoiceIds: number[] = [];
  /** The store's and the stock's payments, written together in the order they were paid. */
  private readonly shelfPayments: ShelfPayment[] = [];

  constructor(options: {
    plan: DemoClinicPlan;
    organizationId: number;
    staff: StaffIds;
    demo: { userId: number; membershipId: number } | null;
    timeZone: string;
    now: Date;
  }) {
    this.plan = options.plan;
    this.organization_id = options.organizationId;
    this.staff = options.staff;
    this.demo = options.demo;
    this.timeZone = options.timeZone;
    this.now = options.now;
    this.ownerId = options.staff.users.owner;
    this.frontDeskId = options.staff.users.frontDesk;
  }

  /** Every step, in the order their ids are needed. */
  async writeAll(): Promise<void> {
    await this.writeBranches();
    await this.writeOfferings();
    await this.writePeople();
    await this.writePatients();
    await this.writeAppointments();
    await this.writePatientFile();
    await this.writeBills();
    await this.writeMedicalStore();
    await this.writeClinicStock();
    await this.writeShelfPayments();
    await this.writeTasks();
  }

  private instant(moment: DemoMoment): Date {
    return instantInTimeZone({ ...moment, timeZone: this.timeZone });
  }

  /** A record's creation time: the moment, or now when the plan puts it later today. */
  private createdAt(moment: DemoMoment): Date {
    return new Date(Math.min(this.instant(moment).getTime(), this.now.getTime()));
  }

  private patientOfVisit(appointment: number): number {
    return this.patientIds.get(this.plan.appointments[appointment]!.person)!;
  }

  /** The branches with their address and defaults, their members, rooms and machines. */
  private async writeBranches(): Promise<void> {
    const { plan, staff, demo, organization_id } = this;
    for (const branch of plan.branches) {
      const branchId = await seedBranch({
        organization_id,
        name: branch.name,
        is_main: branch.key === 'main',
        area: branch.area,
        created_by_user_id: this.ownerId,
        details: {
          tone: branch.tone,
          address_line_one: branch.addressLineOne,
          city: branch.city,
          state: branch.state,
          postal_code: branch.postalCode,
          phone: branch.phone,
          email: branch.email,
          gst_number: branch.gstNumber,
          opens_at: '10:00',
          closes_at: '20:00',
          working_days: [...WEEKDAY_VALUES],
          maps_link: `https://maps.google.com/?q=${encodeURIComponent(`${plan.name}, ${branch.area}, ${branch.city}`)}`,
          review_link: branch.reviewLink,
          default_doctor_membership_id: staff.memberships[branch.doctor],
          default_therapist_membership_id: staff.memberships[branch.therapist],
          default_front_desk_membership_id: staff.memberships.frontDesk,
        },
      });
      this.branchIds[branch.key] = branchId;
      const members = plan.staff
        .filter((member) => member.branches.includes(branch.key))
        .map((member) => staff.users[member.key]);
      for (const user_id of demo ? [...members, demo.userId] : members) {
        await seedBranchMember({ branch_id: branchId, organization_id, user_id });
      }
      for (const name of DEMO_ROOMS) {
        this.roomIds[branch.key].push(
          await seedBranchRoom({
            organization_id,
            branch_id: branchId,
            name,
            created_by_user_id: this.ownerId,
          }),
        );
      }
      for (const name of DEMO_MACHINES) {
        this.machineIds[branch.key].set(
          name,
          await seedBranchMachine({
            organization_id,
            branch_id: branchId,
            name,
            created_by_user_id: this.ownerId,
          }),
        );
      }
    }
  }

  /** The price list. */
  private async writeOfferings(): Promise<void> {
    for (const offering of DEMO_OFFERINGS) {
      this.offeringIds.set(
        offering.key,
        await seedOffering({
          organization_id: this.organization_id,
          name: offering.name,
          category: offering.category,
          specialty: offering.specialty,
          tone: offering.tone,
          price: offering.price.toFixed(2),
          duration_minutes: offering.durationMinutes,
          gst_percent: offering.gstPercent,
          is_gst_inclusive: offering.gstPercent > 0,
          created_by_user_id: this.ownerId,
        }),
      );
    }
  }

  /** Everyone as a contact, then the enquiries with their WhatsApp threads. */
  private async writePeople(): Promise<void> {
    const { plan, organization_id, frontDeskId } = this;
    for (const person of plan.people) {
      this.contactIds.push(
        await seedContact({
          organization_id,
          first_name: person.firstName,
          last_name: person.lastName,
          phone: person.phone,
          created_by_user_id: frontDeskId,
          created_at: this.createdAt(person.firstSeen),
        }),
      );
    }
    for (const lead of plan.leads) {
      const person = plan.people[lead.person]!;
      this.leadIds.push(
        await seedLead({
          organization_id,
          first_name: person.firstName,
          last_name: person.lastName,
          status: lead.status,
          source: lead.source,
          interests: lead.interests,
          ...(lead.heldByFrontDesk ? { owner_user_id: frontDeskId } : {}),
          created_by_user_id: frontDeskId,
          details: {
            branch_id: this.branchIds[lead.branch],
            created_at: this.createdAt(lead.createdAt),
            ...(lead.followUpAt ? { follow_up_at: this.instant(lead.followUpAt) } : {}),
          },
        }),
      );
      for (const message of lead.messages)
        await this.writeMessage({ person: lead.person, message });
    }
  }

  /** One WhatsApp message: a sent one is the front desk's, delivered and read. */
  private async writeMessage(options: {
    person: number;
    message: DemoClinicPlan['leads'][number]['messages'][number];
  }) {
    const { person, message } = options;
    const at = this.createdAt(message.at);
    const sent =
      message.direction === 'sent'
        ? {
            delivery_status: 'read',
            delivered_at: at,
            read_at: at,
            author_membership_id: this.staff.memberships.frontDesk,
            created_by_user_id: this.frontDeskId,
          }
        : {};
    await seedContactActivity({
      organization_id: this.organization_id,
      contact_id: this.contactIds[person]!,
      type: 'whatsapp',
      direction: message.direction,
      body: message.body,
      occurred_at: at,
      created_at: at,
      ...sent,
    });
  }

  /** The patient files, each opened at the patient's first visit. */
  private async writePatients(): Promise<void> {
    const { plan, staff } = this;
    const firstVisitOf = new Map<number, DemoMoment>();
    for (const visit of plan.appointments) {
      const known = firstVisitOf.get(visit.person);
      if (!known || visit.date < known.date)
        firstVisitOf.set(visit.person, { date: visit.date, time: visit.start });
    }
    for (const patient of plan.patients) {
      const branch = plan.branches.find((item) => item.key === patient.branch)!;
      const opened = this.createdAt(
        firstVisitOf.get(patient.person) ?? plan.people[patient.person]!.firstSeen,
      );
      this.patientIds.set(
        patient.person,
        await seedPatient({
          organization_id: this.organization_id,
          contact_id: this.contactIds[patient.person]!,
          home_branch_id: this.branchIds[patient.branch],
          types: [demoCase(patient.caseKey).patientType],
          status: patient.status,
          conversion: patient.status === 'inactive' ? 'not_converted' : 'converted',
          doctor_membership_id: staff.memberships[branch.doctor],
          has_data_consent: true,
          has_photo_consent: true,
          allergies: [...patient.allergies],
          ...(patient.lead === undefined ? {} : { lead_id: this.leadIds[patient.lead] ?? null }),
          created_by_user_id: this.frontDeskId,
          created_at: opened,
          updated_at: opened,
        }),
      );
    }
  }

  /** Every booking, past and coming, in its room (and on its machine). */
  private async writeAppointments(): Promise<void> {
    const { memberships } = this.staff;
    for (const visit of this.plan.appointments) {
      const machineId = visit.usesMachine
        ? this.machineIds[visit.branch].get(demoMachineFor(visit.offering))!
        : null;
      this.appointmentIds.push(
        await seedAppointment({
          organization_id: this.organization_id,
          contact_id: this.contactIds[visit.person]!,
          branch_id: this.branchIds[visit.branch],
          type: visit.type,
          offering_id: this.offeringIds.get(visit.offering)!,
          service_label: demoOffering(visit.offering).name,
          doctor_membership_id: memberships[visit.doctor],
          therapist_membership_id: visit.therapist ? memberships[visit.therapist] : null,
          branch_room_id: this.roomIds[visit.branch][visit.room]!,
          branch_machine_id: machineId,
          appointment_date: visit.date,
          start_time: visit.start,
          duration_minutes: visit.durationMinutes,
          status: visit.status,
          cancel_reason: visit.cancelReason ?? null,
          checked_in_at: this.optionalInstant(visit.checkedInAt),
          completed_at: this.optionalInstant(visit.completedAt),
          visit_stage: visit.visitStage ?? null,
          visit_stage_changed_at: this.optionalInstant(visit.stageChangedAt),
          reason: visit.reason,
          is_confirmed_by_reply: visit.status === 'confirmed',
          created_by_user_id: this.frontDeskId,
          // The visit's last change: its finish, check-in or booking (the feedback rule anchors on it).
          created_at: this.createdAt(visit.bookedAt),
          updated_at: this.createdAt(
            visit.completedAt ?? visit.stageChangedAt ?? visit.checkedInAt ?? visit.bookedAt,
          ),
        }),
      );
    }
  }

  private optionalInstant(moment: DemoMoment | undefined): Date | null {
    return moment ? this.instant(moment) : null;
  }

  /** The patient file: the doctors' notes, the treatments, check-ins and reviews. */
  private async writePatientFile(): Promise<void> {
    const { plan, organization_id, staff, frontDeskId } = this;
    for (const note of plan.notes) {
      const at = this.createdAt(note.at);
      await seedPatientClinicalNote({
        organization_id,
        patient_id: this.patientOfVisit(note.appointment),
        kind: note.kind,
        text: note.text,
        appointment_id: this.appointmentIds[note.appointment]!,
        added_at: at,
        created_by_user_id: staff.users[plan.appointments[note.appointment]!.doctor],
        created_at: at,
        updated_at: at,
      });
    }
    for (const treatment of plan.treatments) await this.writeTreatment(treatment);
    for (const checkIn of plan.checkIns) {
      const at = this.createdAt({ date: checkIn.date, time: '12:30' });
      await seedPatientCheckIn({
        organization_id,
        patient_id: this.patientOfVisit(plan.treatments[checkIn.treatment]!.appointment),
        patient_treatment_id: this.treatmentIds[checkIn.treatment]!,
        context: checkIn.context,
        feel: checkIn.feel,
        score: checkIn.score,
        followed: checkIn.followed,
        current_state: checkIn.currentState,
        next_plan: checkIn.nextPlan,
        check_in_date: checkIn.date,
        created_by_user_id: frontDeskId,
        created_at: at,
        updated_at: at,
      });
    }
    for (const review of plan.reviews) {
      const at = this.createdAt({ date: review.date, time: '19:00' });
      await seedPatientReview({
        organization_id,
        patient_id: this.patientOfVisit(review.appointment),
        appointment_id: this.appointmentIds[review.appointment]!,
        source: review.source,
        rating: review.rating,
        text: review.text,
        review_date: review.date,
        created_by_user_id: frontDeskId,
        created_at: at,
        updated_at: at,
      });
    }
  }

  /** One treatment session on the file, by its therapist (or the doctor for an injectable). */
  private async writeTreatment(treatment: DemoClinicPlan['treatments'][number]): Promise<void> {
    const { memberships, users } = this.staff;
    const visit = this.plan.appointments[treatment.appointment]!;
    const at = this.createdAt(treatment.at);
    this.treatmentIds.push(
      await seedPatientTreatment({
        organization_id: this.organization_id,
        patient_id: this.patientOfVisit(treatment.appointment),
        appointment_id: this.appointmentIds[treatment.appointment]!,
        offering_id: this.offeringIds.get(visit.offering)!,
        name: treatment.name,
        template: 'skin',
        performed_at: at,
        doctor_membership_id: memberships[visit.doctor],
        therapist_membership_id: visit.therapist ? memberships[visit.therapist] : null,
        body_parts: [...treatment.bodyParts],
        session_number: treatment.sessionNumber,
        parameters: { ...treatment.parameters },
        remark: treatment.remark,
        created_by_user_id: users[visit.therapist ?? visit.doctor],
        // The aftercare rule anchors on the treatment's last change.
        created_at: at,
        updated_at: at,
      }),
    );
  }

  /** The bills, each with what was paid on it; the invoice's paid amount follows. */
  private async writeBills(): Promise<void> {
    const { plan, organization_id, staff, frontDeskId } = this;
    for (const bill of plan.invoices) {
      const visit = plan.appointments[bill.appointment]!;
      const offering = demoOffering(visit.offering);
      const billedAt = visit.completedAt ??
        visit.stageChangedAt ?? { date: visit.date, time: visit.start };
      const invoice = await seedInvoice({
        organization_id,
        branch_id: this.branchIds[visit.branch],
        contact_id: this.contactIds[visit.person]!,
        invoice_date: visit.date,
        lines: [
          {
            offering_id: this.offeringIds.get(visit.offering)!,
            name: offering.name,
            quantity: 1,
            rate: offering.price,
            discount_percent: bill.discountPercent,
            gst_percent: offering.gstPercent,
            is_gst_inclusive: offering.gstPercent > 0,
          },
        ],
        member_ids: [
          staff.memberships[visit.doctor],
          ...(visit.therapist ? [staff.memberships[visit.therapist]] : []),
        ],
        created_by_user_id: frontDeskId,
        created_at: this.createdAt(billedAt),
      });
      this.invoiceIds.push(invoice.id);
      const amount = Math.round(invoice.total * bill.paidShare * 100) / 100;
      const { payment } = bill;
      if (payment !== null && amount > 0) {
        const at = this.createdAt(payment.at);
        await seedPayment({
          organization_id,
          direction: 'received',
          kind: 'receipt',
          branch_id: this.branchIds[visit.branch],
          amount: amount.toFixed(2),
          [`${payment.mode}_amount`]: amount.toFixed(2),
          paid_at: at,
          contact_id: this.contactIds[visit.person]!,
          invoice_id: invoice.id,
          created_by_user_id: frontDeskId,
          created_at: at,
          updated_at: at,
        });
        await seedInvoicePaidAmount({ invoice_id: invoice.id, paid_amount: amount });
      }
    }
  }

  /**
   * The medical store: its brands, agencies and their prices, the medicines with every batch, the
   * orders and their lines, the packs sent back to agencies, the MRs and the sales; the payments
   * follow in {@link writeShelfPayments}.
   */
  private async writeMedicalStore(): Promise<void> {
    const { store } = this.plan;
    const { organization_id, ownerId, frontDeskId } = this;
    const opened = this.createdAt(store.openedAt);
    const byOwner = {
      created_by_user_id: ownerId,
      updated_by_user_id: ownerId,
      created_at: opened,
      updated_at: opened,
    };
    const manufacturerIds = new Map<DemoManufacturerKey, number>();
    for (const manufacturer of DEMO_MANUFACTURERS) {
      manufacturerIds.set(
        manufacturer.key,
        await seedManufacturer({
          organization_id,
          name: manufacturer.name,
          tone: manufacturer.tone,
          ...byOwner,
        }),
      );
    }
    const supplierIds = new Map<DemoSupplierKey, number>();
    for (const supplier of store.suppliers) {
      const supplierId = await seedSupplier({
        organization_id,
        name: supplier.name,
        phone: supplier.phone,
        gst_number: supplier.gstNumber,
        ...byOwner,
      });
      supplierIds.set(supplier.key, supplierId);
      for (const key of supplier.manufacturers) {
        await seedSupplierManufacturer({
          supplier_id: supplierId,
          manufacturer_id: manufacturerIds.get(key)!,
          organization_id,
          created_by_user_id: ownerId,
          created_at: opened,
        });
      }
    }
    const medicineIds = new Map<DemoMedicineKey, number>();
    for (const medicine of store.medicines) {
      const item = demoMedicine(medicine.key);
      medicineIds.set(
        medicine.key,
        await seedMedicine({
          organization_id,
          name: item.name,
          composition: item.composition,
          manufacturer_id: manufacturerIds.get(item.manufacturer)!,
          is_prescription_only: item.isPrescriptionOnly,
          hsn_code: item.hsnCode,
          pack_label: item.packLabel,
          mrp: item.mrp.toFixed(2),
          gst_percent: item.gstPercent,
          min_stock: item.minStock,
          max_stock: item.maxStock,
          quantity: medicine.quantity,
          near_expiry_discount_percent: item.nearExpiryDiscountPercent?.toFixed(2) ?? null,
          ...byOwner,
          updated_at: this.createdAt(medicine.updatedAt),
        }),
      );
    }
    for (const price of store.prices) {
      await seedMedicineSupplierPrice({
        medicine_id: medicineIds.get(price.medicine)!,
        supplier_id: supplierIds.get(price.supplier)!,
        organization_id,
        rate: rupeesText(price.ratePaise),
        free_quantity: price.freeQuantity,
        lead_days: price.leadDays,
        created_at: opened,
        updated_at: opened,
      });
    }
    const orderIds: number[] = [];
    for (const order of store.purchaseOrders) {
      const taxablePaise = order.lines.reduce(
        (total, line) => total + purchaseLineGst(line).taxablePaise,
        0,
      );
      const orderId = await seedMedicalPurchaseOrder({
        organization_id,
        supplier_id: supplierIds.get(order.supplier)!,
        supplier_bill_number: order.supplierBillNumber ?? null,
        order_date: order.orderDate,
        stage: order.receivedAt
          ? MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED
          : MEDICAL_PURCHASE_ORDER_STAGE.ORDERED,
        received_at: this.optionalInstant(order.receivedAt),
        total: rupeesText(order.totalPaise),
        taxable_total: rupeesText(taxablePaise),
        gst_total: rupeesText(order.totalPaise - taxablePaise),
        paid_amount: rupeesText(order.paidPaise),
        credited_amount: rupeesText(order.creditedPaise),
        created_by_user_id: frontDeskId,
        updated_by_user_id: frontDeskId,
        created_at: this.createdAt(order.orderedAt),
        updated_at: this.createdAt(order.updatedAt),
      });
      orderIds.push(orderId);
      if (order.payment) {
        const { payment } = order;
        const supplierName = store.suppliers.find((item) => item.key === order.supplier)!.name;
        this.shelfPayments.push({
          at: payment.at,
          write: () =>
            this.writeSupplierBill({
              at: payment.at,
              mode: payment.mode,
              amountPaise: payment.amountPaise,
              payeeName: supplierName,
              link: { medical_purchase_order_id: orderId },
            }),
        });
      }
    }
    const batchIds: number[] = [];
    for (const batch of store.batches) {
      batchIds.push(
        await seedMedicineBatch({
          organization_id,
          medicine_id: medicineIds.get(batch.medicine)!,
          batch_number: batch.batchNumber,
          expiry_month: batch.expiryMonth,
          quantity: batch.quantity,
          purchase_rate: rupeesText(batch.purchaseRatePaise),
          supplier_id: supplierIds.get(batch.supplier)!,
          medical_purchase_order_id:
            batch.purchaseOrder === undefined ? null : orderIds[batch.purchaseOrder]!,
          created_by_user_id: frontDeskId,
          updated_by_user_id: frontDeskId,
          created_at: this.createdAt(batch.createdAt),
          updated_at: this.createdAt(batch.updatedAt),
        }),
      );
    }
    for (const [index, order] of store.purchaseOrders.entries()) {
      for (const [lineIndex, line] of order.lines.entries()) {
        const batch = line.batch === undefined ? undefined : store.batches[line.batch]!;
        const gst = purchaseLineGst(line);
        await seedMedicalPurchaseOrderItem({
          organization_id,
          medical_purchase_order_id: orderIds[index]!,
          line_number: lineIndex + 1,
          medicine_id: medicineIds.get(line.medicine)!,
          quantity: line.quantity,
          free_quantity: line.freeQuantity,
          rate: rupeesText(line.ratePaise),
          amount: rupeesText(line.amountPaise),
          gst_percent: gst.gstPercent,
          is_gst_inclusive: true,
          taxable_amount: rupeesText(gst.taxablePaise),
          gst_amount: rupeesText(gst.gstPaise),
          is_received: batch ? true : null,
          batch_number: batch?.batchNumber ?? null,
          expiry_month: batch?.expiryMonth ?? null,
          medicine_batch_id: line.batch === undefined ? null : batchIds[line.batch]!,
          created_at: this.createdAt(order.orderedAt),
          updated_at: this.createdAt(order.receivedAt ?? order.orderedAt),
        });
      }
    }
    for (const credit of store.credits) {
      await seedSupplierCredit({
        organization_id,
        supplier_id: supplierIds.get(credit.supplier)!,
        medicine_id: medicineIds.get(credit.medicine)!,
        medicine_batch_id: batchIds[credit.batch]!,
        quantity: credit.quantity,
        rate: rupeesText(credit.ratePaise),
        amount: rupeesText(credit.amountPaise),
        applied_amount: rupeesText(credit.appliedPaise),
        created_by_membership_id: this.staff.memberships.frontDesk,
        created_by_user_id: frontDeskId,
        updated_by_user_id: frontDeskId,
        created_at: this.createdAt(credit.at),
        updated_at: this.createdAt(credit.updatedAt),
      });
    }
    await this.writeMedicalReps(manufacturerIds);
    await this.writeMedicalSales({ medicineIds, batchIds });
    for (const expense of store.expenses) {
      this.shelfPayments.push({
        at: expense.at,
        write: () =>
          this.writeShelfPayment({
            at: expense.at,
            values: {
              kind: PAYMENT_KIND.EXPENSE,
              expense_category: PAYMENT_EXPENSE_CATEGORY.MEDICINES,
              payee_name: expense.payeeName,
              note: expense.note,
              amount: rupeesText(expense.amountPaise),
              [`${expense.mode}_amount`]: rupeesText(expense.amountPaise),
            },
          }),
      });
    }
  }

  /** The MRs with the brands they represent, and their visits as logged. */
  private async writeMedicalReps(manufacturerIds: Map<DemoManufacturerKey, number>): Promise<void> {
    const { store } = this.plan;
    const { organization_id, ownerId, staff } = this;
    const repIds: number[] = [];
    for (const rep of store.reps) {
      const createdAt = this.createdAt(rep.createdAt);
      const repId = await seedMedicalRep({
        organization_id,
        name: rep.name,
        phone: rep.phone,
        next_visit_on: rep.nextVisitOn,
        created_by_user_id: ownerId,
        updated_by_user_id: ownerId,
        created_at: createdAt,
        updated_at: this.createdAt(rep.updatedAt),
      });
      repIds.push(repId);
      for (const key of rep.manufacturers) {
        await seedMedicalRepManufacturer({
          medical_rep_id: repId,
          manufacturer_id: manufacturerIds.get(key)!,
          organization_id,
          created_by_user_id: ownerId,
          created_at: createdAt,
        });
      }
    }
    for (const visit of store.repVisits) {
      const at = this.createdAt(visit.at);
      await seedMedicalRepVisit({
        organization_id,
        medical_rep_id: repIds[visit.rep]!,
        visit_date: visit.visitDate,
        next_visit_on: visit.nextVisitOn,
        samples: visit.samples,
        notes: visit.notes,
        logged_by_membership_id: staff.memberships[visit.loggedBy],
        created_by_user_id: staff.users[visit.loggedBy],
        updated_by_user_id: staff.users[visit.loggedBy],
        created_at: at,
        updated_at: at,
      });
    }
  }

  /** The store's sales with their `medical` bills; what was paid on each goes to the ledger. */
  private async writeMedicalSales(options: {
    medicineIds: Map<DemoMedicineKey, number>;
    batchIds: readonly number[];
  }): Promise<void> {
    const { store } = this.plan;
    const { organization_id, staff, frontDeskId } = this;
    for (const sale of store.sales) {
      const result = await seedMedicalSale({
        organization_id,
        branch_id: this.branchIds[sale.branch],
        contact_id: this.contactIds[sale.person]!,
        invoice_date: sale.at.date,
        sold_at: this.createdAt(sale.at),
        lines: sale.lines.map((line) => {
          const medicine = demoMedicine(line.medicine);
          return {
            medicine_id: options.medicineIds.get(line.medicine)!,
            medicine_batch_id: options.batchIds[line.batch]!,
            batch_number: store.batches[line.batch]!.batchNumber,
            name: medicine.name,
            pack_size: medicine.packLabel,
            hsn_code: medicine.hsnCode,
            quantity: line.quantity,
            rate: medicine.mrp,
            discount_percent: line.discountPercent,
            gst_percent: medicine.gstPercent,
          };
        }),
        member_ids: sale.doctor ? [staff.memberships[sale.doctor]] : [],
        created_by_user_id: frontDeskId,
      });
      const amount = Math.round(result.total * sale.paidShare * 100) / 100;
      const { payment } = sale;
      if (payment === null || amount <= 0) continue;
      this.shelfPayments.push({
        at: payment.at,
        write: async () => {
          await this.writeShelfPayment({
            at: payment.at,
            branch: sale.branch,
            values: {
              direction: PAYMENT_DIRECTION.RECEIVED,
              kind: PAYMENT_KIND.RECEIPT,
              contact_id: this.contactIds[sale.person]!,
              invoice_id: result.invoiceId,
              amount: amount.toFixed(2),
              [`${payment.mode}_amount`]: amount.toFixed(2),
            },
          });
          await seedInvoicePaidAmount({ invoice_id: result.invoiceId, paid_amount: amount });
        },
      });
    }
  }

  /**
   * The clinic's own stock: the vendors, the items at the balance their movements leave, the
   * vendor bills with their lines, the stock checks and every movement in time order.
   */
  private async writeClinicStock(): Promise<void> {
    const { stock } = this.plan;
    const { organization_id, ownerId, frontDeskId, staff } = this;
    const opened = this.createdAt(stock.openedAt);
    const vendorIds = new Map<DemoStockVendorKey, number>();
    for (const vendor of stock.vendors) {
      vendorIds.set(
        vendor.key,
        await seedStockVendor({
          organization_id,
          name: vendor.name,
          phone: vendor.phone,
          created_by_user_id: ownerId,
          updated_by_user_id: ownerId,
          created_at: opened,
          updated_at: opened,
        }),
      );
    }
    const itemIds = new Map<DemoStockItemKey, number>();
    for (const item of stock.items) {
      const entry = demoStockItem(item.key);
      itemIds.set(
        item.key,
        await seedStockItem({
          organization_id,
          name: entry.name,
          category: entry.category,
          unit: entry.unit,
          size_per_unit: entry.size ? quantityText(quantityMilli(entry.size.perUnit)) : null,
          measure_unit: entry.size?.measure ?? null,
          quantity: quantityText(item.quantityMilli),
          min_quantity: quantityText(quantityMilli(entry.minQuantity)),
          max_quantity: quantityText(quantityMilli(entry.maxQuantity)),
          usage_per_week: quantityText(quantityMilli(entry.usagePerWeek)),
          stock_vendor_id: vendorIds.get(entry.vendor)!,
          last_rate: item.lastRatePaise === null ? null : rupeesText(item.lastRatePaise),
          created_by_user_id: ownerId,
          updated_by_user_id: frontDeskId,
          created_at: opened,
          updated_at: this.createdAt(item.updatedAt),
        }),
      );
    }
    const purchaseIds: number[] = [];
    for (const purchase of stock.purchases) {
      const purchaseId = await seedStockPurchase({
        organization_id,
        stock_vendor_id: vendorIds.get(purchase.vendor)!,
        bill_number: purchase.billNumber,
        purchase_date: purchase.purchaseDate,
        bill_amount: rupeesText(purchase.billPaise),
        paid_amount: rupeesText(purchase.paidPaise),
        created_by_user_id: frontDeskId,
        updated_by_user_id: frontDeskId,
        created_at: this.createdAt(purchase.at),
        updated_at: this.createdAt(purchase.updatedAt),
        lines: purchase.lines.map((line) => ({
          stock_item_id: itemIds.get(line.item)!,
          quantity: quantityText(line.quantityMilli),
          rate: rupeesText(line.ratePaise),
          amount: rupeesText(line.amountPaise),
        })),
      });
      purchaseIds.push(purchaseId);
      if (purchase.payment) {
        const { payment } = purchase;
        const vendorName = stock.vendors.find((item) => item.key === purchase.vendor)!.name;
        this.shelfPayments.push({
          at: payment.at,
          write: () =>
            this.writeSupplierBill({
              at: payment.at,
              mode: payment.mode,
              amountPaise: payment.amountPaise,
              payeeName: vendorName,
              link: { stock_purchase_id: purchaseId },
            }),
        });
      }
    }
    const countIds: number[] = [];
    for (const count of stock.counts) {
      const countedAt = this.createdAt(count.at);
      countIds.push(
        await seedStockCount({
          organization_id,
          counted_at: countedAt,
          author_membership_id: staff.memberships[count.by],
          created_by_user_id: staff.users[count.by],
          created_at: countedAt,
          lines: count.lines.map((line) => ({
            stock_item_id: itemIds.get(line.item)!,
            system_quantity: quantityText(line.systemMilli),
            counted_quantity: quantityText(line.countedMilli),
          })),
        }),
      );
    }
    const movementIds: number[] = [];
    for (const movement of stock.movements) {
      movementIds.push(
        await seedStockItemMovement({
          organization_id,
          stock_item_id: itemIds.get(movement.item)!,
          type: movement.type,
          quantity_change: quantityText(movement.changeMilli),
          quantity_after: quantityText(movement.afterMilli),
          used_for: movement.usedFor ?? null,
          note: movement.note ?? null,
          patient_treatment_id:
            movement.treatment === undefined ? null : this.treatmentIds[movement.treatment]!,
          stock_purchase_id:
            movement.purchase === undefined ? null : purchaseIds[movement.purchase]!,
          stock_count_id: movement.count === undefined ? null : countIds[movement.count]!,
          reverts_stock_item_movement_id:
            movement.reverts === undefined ? null : movementIds[movement.reverts]!,
          revert_reason: movement.revertReason ?? null,
          author_membership_id: staff.memberships[movement.by],
          created_by_user_id: staff.users[movement.by],
          created_at: this.createdAt(movement.at),
        }),
      );
    }
  }

  /** A supplier bill paying an agency's order or a vendor's bill, from the main branch (MD7, S11). */
  private writeSupplierBill(options: {
    at: DemoMoment;
    mode: 'cash' | 'upi' | 'card';
    amountPaise: number;
    payeeName: string;
    link: { medical_purchase_order_id: number } | { stock_purchase_id: number };
  }): Promise<void> {
    const amount = rupeesText(options.amountPaise);
    return this.writeShelfPayment({
      at: options.at,
      values: {
        kind: PAYMENT_KIND.SUPPLIER_BILL,
        payee_name: options.payeeName,
        amount,
        [`${options.mode}_amount`]: amount,
        ...options.link,
      },
    });
  }

  /** One payment of the shelves at its moment (paid out of the main branch unless it says so). */
  private async writeShelfPayment(options: {
    at: DemoMoment;
    branch?: 'main' | 'second';
    values: Partial<Parameters<typeof seedPayment>[0]> & { amount: string; kind: string };
  }): Promise<void> {
    const at = this.createdAt(options.at);
    await seedPayment({
      organization_id: this.organization_id,
      direction: PAYMENT_DIRECTION.PAID,
      branch_id: this.branchIds[options.branch ?? 'main'],
      paid_at: at,
      created_by_user_id: this.frontDeskId,
      created_at: at,
      updated_at: at,
      ...options.values,
    });
  }

  /** The store's and the stock's payments, in the order they were paid (their numbers follow). */
  private async writeShelfPayments(): Promise<void> {
    const ordered = [...this.shelfPayments].sort((first, second) =>
      momentKey(first.at).localeCompare(momentKey(second.at)),
    );
    for (const payment of ordered) await payment.write();
  }

  /** The planned tasks: aftercare calls made, a snoozed follow-up, the demo login's to-dos. */
  private async writeTasks(): Promise<void> {
    const { demo, staff } = this;
    for (const task of this.plan.tasks) {
      const owner = task.owner === 'demo' ? demo?.membershipId : staff.memberships[task.owner];
      if (owner === undefined) continue; // the demo login is not seeded
      const due = this.instant(task.dueAt);
      const created = task.createdAt
        ? this.createdAt(task.createdAt)
        : new Date(Math.min(due.getTime() - 86_400_000, this.now.getTime()));
      const resolved = this.optionalInstant(task.resolvedAt);
      await seedTask({
        organization_id: this.organization_id,
        kind: task.kind,
        rule_key: task.ruleKey ?? null,
        title: task.title,
        why: task.why ?? null,
        owner_membership_id: owner,
        contact_id: task.person === undefined ? null : this.contactIds[task.person]!,
        lead_id: task.lead === undefined ? null : (this.leadIds[task.lead] ?? null),
        patient_treatment_id:
          task.treatment === undefined ? null : this.treatmentIds[task.treatment]!,
        invoice_id: task.invoice === undefined ? null : this.invoiceIds[task.invoice]!,
        branch_id: this.branchIds[task.branch],
        due_at: due,
        status: task.status,
        snoozed_until: this.optionalInstant(task.snoozedUntil),
        outcome: task.outcome ?? null,
        result_text: task.resultText ?? null,
        resolved_at: resolved,
        resolved_by_membership_id: task.status === 'done' ? owner : null,
        priority: task.priority,
        created_by_user_id: task.owner === 'demo' ? demo?.userId : this.frontDeskId,
        created_at: created,
        updated_at: resolved ?? created,
      });
    }
  }
}

/**
 * Auto-run only when executed directly (`tsx src/scripts/seed/demo-clinic.ts`), never on import —
 * `full.ts` imports {@link runDemoClinicSeed}. `closeDatabase` always runs so the pool drains.
 */
if (isMain(import.meta.url)) {
  const { values } = parseCommandLine({
    args: process.argv.slice(2),
    options: { fresh: { type: 'boolean' } },
  });
  runDemoClinicSeed({ fresh: values.fresh === true })
    .catch((error) => {
      logger.error({ error }, 'seed.demo-clinic: failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabase();
    });
}
