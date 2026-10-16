/**
 * The demo clinic's story as data — who works there, who comes in, and every visit, bill, note
 * and task of the last six weeks and the next two — built by a pure function from a seeded Faker,
 * today's date and the clock. `demo-clinic.ts` writes it; nothing here touches the database, so
 * the plan is unit-tested on its own (no overlapping bookings, every Today lane filled).
 */
import type { Faker } from '@faker-js/faker';
import {
  addDaysToCalendarDate,
  clockTimeOfMinutes,
  minutesOfClockTime,
  shortCalendarDate,
  weekdayOfCalendarDate,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CLINIC_NAME_STEMS,
  CLINIC_NAME_SUFFIXES,
  DEMO_ALLERGIES,
  DEMO_BUILDINGS,
  DEMO_CASES,
  DEMO_CITIES,
  DEMO_ENQUIRY_MESSAGES,
  DEMO_ENQUIRY_REPLIES,
  type DEMO_MACHINES,
  DEMO_OFFERINGS,
  DEMO_REVIEW_TEXTS,
  DEMO_UNLIKELY_NAMES,
  DEMO_UNLIKELY_SPELLING,
  type DemoBodyPart,
  type DemoCase,
  type DemoCity,
  type DemoOffering,
  type DemoOfferingKey,
} from './demo-clinic.catalog.js';

/** The two branches: the main one and the second. */
export type DemoBranchKey = 'main' | 'second';

/** The staff the clinic is built around. */
export type DemoStaffKey = 'owner' | 'doctor' | 'mainTherapist' | 'secondTherapist' | 'frontDesk';

/** A local moment: calendar date and clock time in the clinic's time zone. */
export interface DemoMoment {
  date: string;
  time: string;
}

/** A branch of the clinic with its real-looking address. */
export interface DemoBranchPlan {
  key: DemoBranchKey;
  name: string;
  tone: string;
  addressLineOne: string;
  area: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  gstNumber: string;
  doctor: DemoStaffKey;
  therapist: DemoStaffKey;
}

/** A team member: their login and their place in the clinic. */
export interface DemoStaffPlan {
  key: DemoStaffKey;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  /** The role name as provisioned (`Owner` is the organization's own role). */
  role: 'Owner' | 'Doctor' | 'Therapist' | 'Front desk';
  /** The owner also sees patients: Doctor as an "Also" role. */
  alsoDoctor: boolean;
  tone: string;
  phone: string;
  branches: readonly DemoBranchKey[];
}

/** A person the clinic knows — every patient and every enquiry is one. */
export interface DemoPersonPlan {
  firstName: string;
  lastName: string;
  sex: 'female' | 'male';
  phone: string;
  /** When the clinic first heard from them. */
  firstSeen: DemoMoment;
}

/** A patient: the person, their branch, condition and standing. */
export interface DemoPatientPlan {
  person: number;
  branch: DemoBranchKey;
  caseKey: string;
  status: 'new' | 'regular' | 'vip' | 'inactive';
  allergies: readonly string[];
  /** The enquiry they came from, when they did (`leads[lead]`). */
  lead?: number;
}

/** One message in an enquiry's WhatsApp thread. */
export interface DemoMessagePlan {
  direction: 'received' | 'sent';
  body: string;
  at: DemoMoment;
}

/** An enquiry (`app.leads`) and its conversation so far. */
export interface DemoLeadPlan {
  person: number;
  branch: DemoBranchKey;
  status:
    | 'new'
    | 'contacted'
    | 'follow_up'
    | 'no_response'
    | 'not_interested'
    | 'lost'
    | 'clinic_visited';
  source: 'instagram' | 'google' | 'whatsapp' | 'facebook' | 'walk_in' | 'referral';
  interests: readonly string[];
  createdAt: DemoMoment;
  followUpAt?: DemoMoment;
  /** Held by the front desk for three days. */
  heldByFrontDesk: boolean;
  messages: readonly DemoMessagePlan[];
}

/** A booking and how far it got. */
export interface DemoAppointmentPlan {
  person: number;
  branch: DemoBranchKey;
  doctor: DemoStaffKey;
  therapist?: DemoStaffKey;
  /** `DEMO_ROOMS` index. */
  room: number;
  usesMachine: boolean;
  offering: DemoOfferingKey;
  type: 'consultation' | 'follow_up' | 'treatment';
  date: string;
  start: string;
  durationMinutes: number;
  status: 'scheduled' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  visitStage?: 'waiting' | 'with_doctor' | 'treatment' | 'checkout';
  checkedInAt?: DemoMoment;
  stageChangedAt?: DemoMoment;
  completedAt?: DemoMoment;
  cancelReason?: 'patient_asked' | 'rescheduling_later';
  bookedAt: DemoMoment;
  reason: string;
}

/** A clinical note written at a first consultation. */
export interface DemoNotePlan {
  appointment: number;
  kind: 'complaint' | 'finding' | 'diagnosis' | 'treatment_suggestion';
  text: string;
  at: DemoMoment;
}

/** A treatment session recorded on the patient's file. */
export interface DemoTreatmentPlan {
  appointment: number;
  name: string;
  sessionNumber: number;
  bodyParts: readonly DemoBodyPart[];
  parameters: Readonly<Record<string, string>>;
  remark: string;
  at: DemoMoment;
}

/** A bill and what was paid on it. */
export interface DemoInvoicePlan {
  appointment: number;
  discountPercent: number;
  /** How and when it was paid; null = unpaid. */
  payment: { mode: 'cash' | 'upi' | 'card'; at: DemoMoment } | null;
  /** The share of the total paid (1 = in full, 0 = unpaid); `demo-clinic.ts` works out the rupees. */
  paidShare: number;
}

/** A progress check-in after a treatment. */
export interface DemoCheckInPlan {
  treatment: number;
  context: string;
  feel: 'much_better' | 'better';
  score: number;
  followed: 'fully' | 'mostly';
  currentState: string;
  nextPlan: string;
  date: string;
}

/** A review a patient left after a visit. */
export interface DemoReviewPlan {
  appointment: number;
  source: 'google' | 'whatsapp' | 'internal_form';
  rating: 5 | 4 | 3;
  text: string;
  date: string;
}

/** A task on the team's work queue. */
export interface DemoTaskPlan {
  kind: 'rule' | 'follow_up' | 'manual';
  ruleKey?: 'aftercare';
  title: string;
  why?: string;
  /** Who holds it: a staff member, or the demo login (`demo@example.com`). */
  owner: DemoStaffKey | 'demo';
  person?: number;
  lead?: number;
  treatment?: number;
  invoice?: number;
  branch: DemoBranchKey;
  /** When the task was opened; absent = a day before it is due (or now, when that is later). */
  createdAt?: DemoMoment;
  dueAt: DemoMoment;
  status: 'open' | 'snoozed' | 'done';
  snoozedUntil?: DemoMoment;
  outcome?: 'done' | 'doing_well' | 'happy' | 'no_answer';
  resultText?: string;
  resolvedAt?: DemoMoment;
  priority: 'low' | 'normal' | 'high';
}

/** Everything `demo-clinic.ts` writes. */
export interface DemoClinicPlan {
  name: string;
  slug: string;
  city: DemoCity;
  branches: readonly [DemoBranchPlan, DemoBranchPlan];
  staff: readonly DemoStaffPlan[];
  people: readonly DemoPersonPlan[];
  patients: readonly DemoPatientPlan[];
  leads: readonly DemoLeadPlan[];
  appointments: readonly DemoAppointmentPlan[];
  notes: readonly DemoNotePlan[];
  treatments: readonly DemoTreatmentPlan[];
  invoices: readonly DemoInvoicePlan[];
  checkIns: readonly DemoCheckInPlan[];
  reviews: readonly DemoReviewPlan[];
  tasks: readonly DemoTaskPlan[];
}

/** Days of history before today, and of bookings after it. */
const HISTORY_DAYS = 42;
const FUTURE_DAYS = 14;
/** The doctors' day (the branches open 10:00–20:00; the last booking ends by 19:00). */
const DAY_STARTS = minutesOfClockTime('10:00');
const DAY_ENDS = minutesOfClockTime('19:00');

const OFFERING_BY_KEY = new Map(DEMO_OFFERINGS.map((offering) => [offering.key, offering]));

/** The offering for a key (every key is in the catalog). */
export function demoOffering(key: DemoOfferingKey): DemoOffering {
  return OFFERING_BY_KEY.get(key)!;
}

/** The branch machine a machine-run offering is done on (`DEMO_MACHINES`). */
export function demoMachineFor(key: DemoOfferingKey): (typeof DEMO_MACHINES)[number] {
  if (key === 'co2Scars') return 'Fractional CO2 laser';
  if (key === 'carbonLaser') return 'Q-switched Nd:YAG laser';
  return 'Diode laser';
}

/** The case for a key (every key is in the catalog). */
export function demoCase(key: string): DemoCase {
  return DEMO_CASES.find((item) => item.key === key)!;
}

/** An Indian mobile number: +91, then 10 digits starting 6–9. */
function mobile(options: { faker: Faker; used: Set<string> }): string {
  const { faker, used } = options;
  for (;;) {
    const phone = `+91${faker.helpers.arrayElement(['6', '7', '8', '9'])}${faker.string.numeric(9)}`;
    if (!used.has(phone)) {
      used.add(phone);
      return phone;
    }
  }
}

/** A name as plain lower-case ASCII for an email address. */
function emailPart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

/** A kebab slug of the clinic's name (`Dr. Rao's Skin & Hair Clinic` → `dr-raos-skin-hair-clinic`). */
export function slugOfClinicName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A GSTIN in the official shape: state code, a firm's PAN, entity 1, `Z`, a check character. */
function gstNumber(options: { faker: Faker; stateCode: string }): string {
  const { faker, stateCode } = options;
  const pan = `${faker.string.alpha({ length: 3, casing: 'upper' })}F${faker.string.alpha({ length: 1, casing: 'upper' })}${faker.string.numeric(4)}${faker.string.alpha({ length: 1, casing: 'upper' })}`;
  return `${stateCode}${pan}1Z${faker.string.alphanumeric({ length: 1, casing: 'upper' })}`;
}

/** Keeps each doctor's day free of overlaps — the database's exclusion constraint, planned ahead. */
class DoctorDiary {
  private readonly booked = new Map<string, [number, number][]>();

  isFree(options: { doctor: DemoStaffKey; date: string; start: number; minutes: number }): boolean {
    const end = options.start + options.minutes;
    if (options.start < DAY_STARTS || end > DAY_ENDS) return false;
    const day = this.booked.get(`${options.doctor}|${options.date}`) ?? [];
    return day.every(([from, to]) => end <= from || options.start >= to);
  }

  book(options: { doctor: DemoStaffKey; date: string; start: number; minutes: number }): void {
    const key = `${options.doctor}|${options.date}`;
    const day = this.booked.get(key) ?? [];
    day.push([options.start, options.start + options.minutes]);
    this.booked.set(key, day);
  }

  /** The first free start from `preferred` on, in 15-minute steps; null when the day is full. */
  firstFree(options: {
    doctor: DemoStaffKey;
    date: string;
    preferred: number;
    minutes: number;
  }): number | null {
    for (let start = options.preferred; start + options.minutes <= DAY_ENDS; start += 15) {
      if (this.isFree({ ...options, start })) return start;
    }
    for (let start = DAY_STARTS; start < options.preferred; start += 15) {
      if (this.isFree({ ...options, start })) return start;
    }
    return null;
  }
}

/** Moves a date forward to the next day the clinic's doctors work (Monday–Saturday). */
function workingDay(options: { date: string; direction: 1 | -1 }): string {
  const { date, direction } = options;
  let day = date;
  while (weekdayOfCalendarDate(day) === 'sun')
    day = addDaysToCalendarDate({ date: day, days: direction });
  return day;
}

/** A moment `minutes` after a clock time on a date. */
function at(options: { date: string; minutes: number }): DemoMoment {
  const { date, minutes } = options;
  return { date, time: clockTimeOfMinutes(minutes) };
}

/** How many patients the clinic has. */
const PATIENT_COUNT = 24;

/** The staff the clinic is built around: each one's role, title, colour and branches. */
const STAFF_SEEDS: readonly {
  key: DemoStaffKey;
  sex: 'female' | 'male';
  role: DemoStaffPlan['role'];
  jobTitle: string;
  tone: string;
  branches: readonly DemoBranchKey[];
}[] = [
  {
    key: 'owner',
    sex: 'female',
    role: 'Owner',
    jobTitle: 'Consultant Dermatologist',
    tone: 'lav',
    branches: ['main', 'second'],
  },
  {
    key: 'doctor',
    sex: 'male',
    role: 'Doctor',
    jobTitle: 'Dermatologist & Trichologist',
    tone: 'sky',
    branches: ['second'],
  },
  {
    key: 'mainTherapist',
    sex: 'female',
    role: 'Therapist',
    jobTitle: 'Laser Therapist',
    tone: 'sage',
    branches: ['main'],
  },
  {
    key: 'secondTherapist',
    sex: 'female',
    role: 'Therapist',
    jobTitle: 'Aesthetic Therapist',
    tone: 'peach',
    branches: ['second'],
  },
  {
    key: 'frontDesk',
    sex: 'female',
    role: 'Front desk',
    jobTitle: 'Front Office Executive',
    tone: 'plum',
    branches: ['main', 'second'],
  },
];

/** One booking on today's floor: its branch, lane, and minutes from the clinic's clock. */
interface TodaySlot {
  branch: DemoBranchKey;
  status: DemoAppointmentPlan['status'];
  stage?: DemoAppointmentPlan['visitStage'];
  offset: number;
}

/** Today's floor: a patient in every lane of each branch. */
const TODAY_SLOTS: readonly TodaySlot[] = [
  { branch: 'main', status: 'completed', offset: -150 },
  { branch: 'main', status: 'completed', offset: -120 },
  { branch: 'main', status: 'checked_in', stage: 'checkout', offset: -90 },
  { branch: 'main', status: 'checked_in', stage: 'treatment', offset: -60 },
  { branch: 'main', status: 'checked_in', stage: 'with_doctor', offset: -15 },
  { branch: 'main', status: 'checked_in', stage: 'waiting', offset: 15 },
  { branch: 'main', status: 'confirmed', offset: 45 },
  { branch: 'main', status: 'scheduled', offset: 90 },
  { branch: 'main', status: 'cancelled', offset: 60 },
  { branch: 'second', status: 'completed', offset: -135 },
  { branch: 'second', status: 'checked_in', stage: 'checkout', offset: -75 },
  { branch: 'second', status: 'checked_in', stage: 'with_doctor', offset: -30 },
  { branch: 'second', status: 'checked_in', stage: 'waiting', offset: 15 },
  { branch: 'second', status: 'confirmed', offset: 60 },
  { branch: 'second', status: 'scheduled', offset: 105 },
  { branch: 'second', status: 'no_show', offset: -105 },
];

/** The ten enquiries still open: how far each got and what it asked about. */
const OPEN_LEADS: readonly {
  status: DemoLeadPlan['status'];
  interest: 'lhr' | 'peel' | 'prp' | 'hydrafacial' | 'clinical';
  daysAgo: number;
  replied: boolean;
  followUpDays?: number;
  held: boolean;
}[] = [
  { status: 'new', interest: 'lhr', daysAgo: 0, replied: false, held: false },
  { status: 'new', interest: 'peel', daysAgo: 0, replied: false, held: false },
  { status: 'new', interest: 'prp', daysAgo: 0, replied: false, held: true },
  { status: 'contacted', interest: 'hydrafacial', daysAgo: 2, replied: true, held: true },
  { status: 'contacted', interest: 'clinical', daysAgo: 1, replied: true, held: false },
  { status: 'follow_up', interest: 'lhr', daysAgo: 4, replied: true, followUpDays: 0, held: true },
  {
    status: 'follow_up',
    interest: 'peel',
    daysAgo: 6,
    replied: true,
    followUpDays: 1,
    held: false,
  },
  { status: 'no_response', interest: 'prp', daysAgo: 5, replied: true, held: false },
  { status: 'not_interested', interest: 'lhr', daysAgo: 9, replied: true, held: false },
  { status: 'lost', interest: 'hydrafacial', daysAgo: 16, replied: true, held: false },
];

/** The patients who came from an enquiry (`patients[index]`) and where they found the clinic. */
const CONVERTED_LEADS: readonly { patient: number; source: DemoLeadPlan['source'] }[] = [
  { patient: 5, source: 'instagram' },
  { patient: 11, source: 'google' },
];

/** How long ago each kind of patient first came: a new one in the last week, the others weeks ago. */
const FIRST_VISIT_DAYS_AGO: Readonly<
  Record<DemoPatientPlan['status'], { min: number; max: number }>
> = {
  new: { min: 1, max: 6 },
  regular: { min: 18, max: 36 },
  vip: { min: 18, max: 36 },
  inactive: { min: 34, max: HISTORY_DAYS },
};

/** The case a patient is treated for: the cases that fit their sex, in turn. */
function caseFor(options: { index: number; sex: 'female' | 'male' }): DemoCase {
  const { index, sex } = options;
  const fitting = DEMO_CASES.filter((item) => item.sex === 'any' || sex === 'female');
  return fitting[index % fitting.length]!;
}

/** A patient's standing by their place in the list: a few VIPs, inactive and new ones. */
function statusFor(index: number): DemoPatientPlan['status'] {
  if (index % 8 === 7) return 'inactive';
  if (index % 8 === 3) return 'vip';
  if (index >= 20) return 'new';
  return 'regular';
}

/** Days between treatment sessions: four weeks for laser, PRP and CO2, else two. */
function sessionGap(treatment: DemoOfferingKey): number {
  const isMonthly =
    treatment.startsWith('lhr') || treatment === 'prpHair' || treatment === 'co2Scars';
  return isMonthly ? 28 : 14;
}

/** The parameters a therapist writes for a laser session: the machine, wavelength and power. */
function laserParameters(options: { faker: Faker; key: DemoOfferingKey }): Record<string, string> {
  const { faker, key } = options;
  const wavelengths: Partial<Record<DemoOfferingKey, string>> = {
    carbonLaser: '1064',
    co2Scars: '10600',
  };
  return {
    machine: demoMachineFor(key),
    wavelength: wavelengths[key] ?? '810',
    power: key === 'co2Scars' ? '15 mJ' : `${faker.number.int({ min: 10, max: 16 })} J/cm²`,
  };
}

/** The booking fields {@link DemoClinicPlanner.book} fills in itself (and a preferred start). */
type DemoBooking = Omit<DemoAppointmentPlan, 'doctor' | 'room' | 'usesMachine'> & {
  preferred?: number;
};

/**
 * Builds the plan step by step from one seeded Faker; each step adds its records to the shared
 * lists, and the steps run in a fixed order so a seed always draws the same clinic.
 */
class DemoClinicPlanner {
  private readonly faker: Faker;
  private readonly today: string;
  /** The clinic's clock held between 13:00 and 17:00, on the quarter hour — Today's centre. */
  private readonly anchor: number;
  private readonly phones = new Set<string>();
  /** Every name is used once: a contact is matched by name, and two people never share a file. */
  private readonly names = new Set<string>();
  private readonly diary = new DoctorDiary();
  private branches: readonly [DemoBranchPlan, DemoBranchPlan] | null = null;
  readonly people: DemoPersonPlan[] = [];
  readonly patients: DemoPatientPlan[] = [];
  readonly leads: DemoLeadPlan[] = [];
  readonly appointments: DemoAppointmentPlan[] = [];
  readonly notes: DemoNotePlan[] = [];
  readonly treatments: DemoTreatmentPlan[] = [];
  readonly invoices: DemoInvoicePlan[] = [];
  readonly checkIns: DemoCheckInPlan[] = [];
  readonly reviews: DemoReviewPlan[] = [];
  readonly tasks: DemoTaskPlan[] = [];

  constructor(options: { faker: Faker; today: string; now: string }) {
    this.faker = options.faker;
    this.today = options.today;
    const clock = Math.min(
      Math.max(minutesOfClockTime(options.now), minutesOfClockTime('13:00')),
      minutesOfClockTime('17:00'),
    );
    this.anchor = clock - (clock % 15);
  }

  /** A name not used yet and not on the unlikely list. */
  private name(sex: 'female' | 'male'): { firstName: string; lastName: string } {
    for (;;) {
      const name = {
        firstName: this.faker.person.firstName(sex),
        lastName: this.faker.person.lastName(),
      };
      const key = `${name.firstName} ${name.lastName}`.toLowerCase();
      const isTaken =
        this.names.has(key) ||
        DEMO_UNLIKELY_NAMES.has(name.firstName) ||
        DEMO_UNLIKELY_NAMES.has(name.lastName) ||
        DEMO_UNLIKELY_SPELLING.test(name.firstName);
      if (!isTaken) {
        this.names.add(key);
        return name;
      }
    }
  }

  private branchOf(key: DemoBranchKey): DemoBranchPlan {
    return key === 'main' ? this.branches![0] : this.branches![1];
  }

  private addPerson(options: { sex: 'female' | 'male'; firstSeen: DemoMoment }): number {
    const { sex, firstSeen } = options;
    const name = this.name(sex);
    this.people.push({
      ...name,
      sex,
      phone: mobile({ faker: this.faker, used: this.phones }),
      firstSeen,
    });
    return this.people.length - 1;
  }

  /** The five staff, each with a work email on `example.com` and their own mobile. */
  planStaff(): DemoStaffPlan[] {
    return STAFF_SEEDS.map((seed) => {
      const name = this.name(seed.sex);
      return {
        key: seed.key,
        ...name,
        email: `${emailPart(name.firstName)}.${emailPart(name.lastName)}@example.com`,
        jobTitle: seed.jobTitle,
        role: seed.role,
        alsoDoctor: seed.key === 'owner',
        tone: seed.tone,
        phone: mobile({ faker: this.faker, used: this.phones }),
        branches: seed.branches,
      };
    });
  }

  /** The clinic's name: the owner's (`Dr. Rao's …`) or a meaningful stem, and a suffix. */
  nameClinic(owner: DemoStaffPlan): string {
    const { faker } = this;
    return faker.datatype.boolean({ probability: 0.4 })
      ? `Dr. ${owner.lastName}'s ${faker.helpers.arrayElement(CLINIC_NAME_SUFFIXES)}`
      : `${faker.helpers.arrayElement(CLINIC_NAME_STEMS)} ${faker.helpers.arrayElement(CLINIC_NAME_SUFFIXES)}`;
  }

  /** The two branches in the city's two areas: an address, a mobile and the one GSTIN. */
  planBranches(options: {
    city: DemoCity;
    slug: string;
  }): readonly [DemoBranchPlan, DemoBranchPlan] {
    const { faker } = this;
    const { city, slug } = options;
    const gst = gstNumber({ faker, stateCode: city.gstStateCode });
    const branchPlan = (options: { key: DemoBranchKey; index: 0 | 1 }): DemoBranchPlan => {
      const { key, index } = options;
      const area = city.areas[index];
      return {
        key,
        name: area.area,
        tone: index === 0 ? 'sage' : 'sky',
        addressLineOne: `${faker.number.int({ min: 1, max: 24 })}, ${faker.helpers.arrayElement(['Ground', 'First', 'Second'])} Floor, ${faker.helpers.arrayElement(DEMO_BUILDINGS)}, ${area.road}`,
        area: area.area,
        city: city.city,
        state: city.state,
        postalCode: area.postalCode,
        // A branch's phone is a mobile, never a landline (`MOBILE_NUMBER_PATTERN`).
        phone: mobile({ faker, used: this.phones }),
        email: `${emailPart(area.area)}@${slug}.example.com`,
        gstNumber: gst,
        doctor: index === 0 ? 'owner' : 'doctor',
        therapist: index === 0 ? 'mainTherapist' : 'secondTherapist',
      };
    };
    this.branches = [
      branchPlan({ key: 'main', index: 0 }),
      branchPlan({ key: 'second', index: 1 }),
    ];
    return this.branches;
  }

  /**
   * Books a visit with the branch's doctor at the first free start from the preferred one (a
   * cancelled or missed visit holds no slot); returns its index, or null when the day is full.
   */
  private book(plan: DemoBooking): number | null {
    const branch = this.branchOf(plan.branch);
    const offering = demoOffering(plan.offering);
    const holdsSlot = plan.status !== 'cancelled' && plan.status !== 'no_show';
    let start = minutesOfClockTime(plan.start);
    if (holdsSlot) {
      const free = this.diary.firstFree({
        doctor: branch.doctor,
        date: plan.date,
        preferred: plan.preferred ?? start,
        minutes: plan.durationMinutes,
      });
      if (free === null) return null;
      start = free;
      this.diary.book({
        doctor: branch.doctor,
        date: plan.date,
        start,
        minutes: plan.durationMinutes,
      });
    }
    const { preferred: _preferred, ...rest } = plan;
    let room = 0;
    if (offering.usesMachine) room = 2;
    else if (plan.type === 'treatment') room = 1;
    const hasTherapist = plan.type === 'treatment' && offering.therapyType !== 'injectable';
    this.appointments.push({
      ...rest,
      start: clockTimeOfMinutes(start),
      doctor: branch.doctor,
      room,
      usesMachine: offering.usesMachine === true,
      ...(hasTherapist ? { therapist: branch.therapist } : {}),
    });
    return this.appointments.length - 1;
  }

  /** Marks a booked visit as seen: checked in a few minutes before, done at its end. */
  private markCompleted(options: { appointment: number; checkInLead: number }): void {
    const { appointment, checkInLead } = options;
    const visit = this.appointments[appointment]!;
    const start = minutesOfClockTime(visit.start);
    this.appointments[appointment] = {
      ...visit,
      checkedInAt: at({ date: visit.date, minutes: start - checkInLead }),
      completedAt: at({ date: visit.date, minutes: start + visit.durationMinutes }),
    };
  }

  /** Bills a visit, paid (mostly by UPI or card) a few minutes after it ends. */
  private bill(options: { appointment: number; paidShare?: number; discountPercent?: number }) {
    const { appointment } = options;
    const visit = this.appointments[appointment]!;
    const end = minutesOfClockTime(visit.start) + visit.durationMinutes;
    const paidShare = options.paidShare ?? 1;
    const payment =
      paidShare > 0
        ? {
            mode: this.faker.helpers.weightedArrayElement([
              { weight: 6, value: 'upi' as const },
              { weight: 3, value: 'card' as const },
              { weight: 1, value: 'cash' as const },
            ]),
            at: at({ date: visit.date, minutes: end + 5 }),
          }
        : null;
    this.invoices.push({
      appointment,
      discountPercent: options.discountPercent ?? 0,
      paidShare,
      payment,
    });
  }

  /** Records a finished treatment visit on the file, with the parameters a therapist writes. */
  private recordTreatment(options: {
    appointment: number;
    sessionNumber: number;
    caseKey: string;
  }): number {
    const { appointment, sessionNumber, caseKey } = options;
    const { faker } = this;
    const visit = this.appointments[appointment]!;
    const offering = demoOffering(visit.offering);
    const item = demoCase(caseKey);
    const parameters: Record<string, string> = {
      type: offering.therapyType ?? 'facial',
      skinType: faker.helpers.arrayElement(['III', 'IV', 'IV', 'V']),
      areas: item.bodyParts.join(', '),
      ...(offering.usesMachine ? laserParameters({ faker, key: offering.key }) : {}),
    };
    this.treatments.push({
      appointment,
      name: offering.name,
      sessionNumber,
      bodyParts: item.bodyParts,
      parameters,
      remark: faker.helpers.arrayElement([
        'Tolerated well. Mild redness settled within 20 minutes.',
        'No discomfort reported. Aftercare explained; sunscreen advised.',
        'Mild tingling during the procedure; cold compress applied after.',
      ]),
      at: at({ date: visit.date, minutes: minutesOfClockTime(visit.start) + 10 }),
    });
    return this.treatments.length - 1;
  }

  /**
   * One patient's history: first seen days before a first consultation (with its four notes and
   * bill), then a no-show for an inactive patient, or sessions every two to four weeks.
   */
  planPatient(index: number): void {
    const { faker, today } = this;
    const sex = faker.datatype.boolean({ probability: 0.72 }) ? 'female' : 'male';
    const branch: DemoBranchKey = index % 5 < 3 ? 'main' : 'second';
    const status = statusFor(index);
    const item = caseFor({ index, sex });
    const firstVisitDaysAgo = faker.number.int(FIRST_VISIT_DAYS_AGO[status]);
    const firstVisit = workingDay({
      date: addDaysToCalendarDate({ date: today, days: -firstVisitDaysAgo }),
      direction: -1,
    });
    const firstSeen = at({
      date: addDaysToCalendarDate({
        date: firstVisit,
        days: -faker.number.int({ min: 1, max: 4 }),
      }),
      minutes: faker.number.int({ min: 600, max: 1200 }),
    });
    const person = this.addPerson({ sex, firstSeen });
    this.patients.push({
      person,
      branch,
      caseKey: item.key,
      status,
      allergies: index % 9 === 4 ? [faker.helpers.arrayElement(DEMO_ALLERGIES)] : [],
    });

    const consultation = this.planConsultation({ person, branch, item, firstVisit, firstSeen });
    if (consultation === null) return;
    if (status === 'inactive') {
      // Booked once more, never came.
      const consultStart = minutesOfClockTime(this.appointments[consultation]!.start);
      this.book({
        person,
        branch,
        offering: item.treatment,
        type: 'treatment',
        date: workingDay({
          date: addDaysToCalendarDate({ date: firstVisit, days: 10 }),
          direction: 1,
        }),
        start: '12:00',
        durationMinutes: demoOffering(item.treatment).durationMinutes,
        status: 'no_show',
        bookedAt: at({ date: firstVisit, minutes: consultStart + 20 }),
        reason: 'Treatment session',
      });
      return;
    }
    const lastTreatment = this.planSessions({ index, person, branch, item, status, firstVisit });
    if (lastTreatment !== null && index % 3 === 0) this.planReview({ index, lastTreatment });
  }

  /** The first consultation: done, with the doctor's four notes, and billed. */
  private planConsultation(options: {
    person: number;
    branch: DemoBranchKey;
    item: DemoCase;
    firstVisit: string;
    firstSeen: DemoMoment;
  }): number | null {
    const { item, firstVisit } = options;
    const consultation = this.book({
      person: options.person,
      branch: options.branch,
      offering: 'consultation',
      type: 'consultation',
      date: firstVisit,
      start: '11:00',
      preferred: this.faker.helpers.arrayElement([600, 660, 720, 960, 1020]),
      durationMinutes: 15,
      status: 'completed',
      bookedAt: options.firstSeen,
      reason: 'First consultation',
    });
    if (consultation === null) return null;
    this.markCompleted({ appointment: consultation, checkInLead: 8 });
    const noted = at({
      date: firstVisit,
      minutes: minutesOfClockTime(this.appointments[consultation]!.start) + 8,
    });
    const noteKinds = [
      ['complaint', item.complaint],
      ['finding', item.finding],
      ['diagnosis', item.diagnosis],
      ['treatment_suggestion', item.suggestion],
    ] as const;
    for (const [kind, text] of noteKinds) {
      this.notes.push({ appointment: consultation, kind, text, at: noted });
    }
    this.bill({ appointment: consultation });
    return consultation;
  }

  /**
   * Treatment sessions from three days after the consultation until today, each recorded and
   * billed (the odd one part-paid; 10% off for a VIP or from the third session), and the first
   * one's check-in three days on; returns the last treatment's index.
   */
  private planSessions(options: {
    index: number;
    person: number;
    branch: DemoBranchKey;
    item: DemoCase;
    status: DemoPatientPlan['status'];
    firstVisit: string;
  }): number | null {
    const { faker, today } = this;
    const { index, item, status } = options;
    const offering = demoOffering(item.treatment);
    const gap = sessionGap(item.treatment);
    let session = 0;
    let lastTreatment: number | null = null;
    let day = addDaysToCalendarDate({ date: options.firstVisit, days: 3 });
    for (
      let date = workingDay({ date: day, direction: 1 });
      date < today;
      date = workingDay({ date: day, direction: 1 })
    ) {
      day = addDaysToCalendarDate({ date: day, days: gap });
      const visit = this.book({
        person: options.person,
        branch: options.branch,
        offering: item.treatment,
        type: 'treatment',
        date,
        start: '12:00',
        preferred: faker.helpers.arrayElement([630, 690, 750, 900, 990, 1050]),
        durationMinutes: offering.durationMinutes,
        status: 'completed',
        bookedAt: at({
          date: addDaysToCalendarDate({ date, days: -faker.number.int({ min: 2, max: 7 }) }),
          minutes: 660,
        }),
        reason: `${offering.name} — session ${session + 1}`,
      });
      if (visit === null) continue;
      this.markCompleted({ appointment: visit, checkInLead: 6 });
      session += 1;
      const treatment = this.recordTreatment({
        appointment: visit,
        sessionNumber: session,
        caseKey: item.key,
      });
      lastTreatment = treatment;
      this.bill({
        appointment: visit,
        paidShare: index % 7 === 2 && session === 1 ? 0.6 : 1,
        discountPercent: status === 'vip' || session >= 3 ? 10 : 0,
      });
      // The follow-up call three days on — only when that day has come.
      const checkInDate = addDaysToCalendarDate({ date, days: 3 });
      if (session === 1 && checkInDate <= today) {
        this.checkIns.push({
          treatment,
          context: `After ${offering.name.toLowerCase()} — session 1`,
          feel: faker.helpers.arrayElement(['better', 'much_better']),
          score: faker.number.int({ min: 6, max: 9 }),
          followed: faker.helpers.arrayElement(['fully', 'mostly']),
          currentState: item.progress,
          nextPlan: item.nextPlan,
          date: checkInDate,
        });
      }
    }
    return lastTreatment;
  }

  /** A review the day after the last session: Google for five stars, WhatsApp for four. */
  private planReview(options: { index: number; lastTreatment: number }): void {
    const { index, lastTreatment } = options;
    const rating = ([5, 5, 4, 5, 3, 4, 5, 5] as const)[(index / 3) % 8]!;
    const sources = { 5: 'google', 4: 'whatsapp', 3: 'internal_form' } as const;
    const visit = this.treatments[lastTreatment]!.appointment;
    this.reviews.push({
      appointment: visit,
      source: sources[rating],
      rating,
      text: this.faker.helpers.arrayElement(DEMO_REVIEW_TEXTS[rating]),
      date: addDaysToCalendarDate({ date: this.appointments[visit]!.date, days: 1 }),
    });
  }

  /** Today's floor: each slot of {@link TODAY_SLOTS} for the branch's patients in turn. */
  planToday(): void {
    const { today } = this;
    const regulars = this.patients.filter((patient) => patient.status !== 'inactive');
    const turn = new Map<DemoBranchKey, number>([
      ['main', 0],
      ['second', 0],
    ]);
    for (const slot of TODAY_SLOTS) {
      const candidates = regulars.filter((patient) => patient.branch === slot.branch);
      const patient = candidates[(turn.get(slot.branch) ?? 0) % candidates.length]!;
      turn.set(slot.branch, (turn.get(slot.branch) ?? 0) + 1);
      const item = demoCase(patient.caseKey);
      const isReview = slot.stage === 'with_doctor' || slot.status === 'scheduled';
      const offeringKey: DemoOfferingKey = isReview ? 'followUp' : item.treatment;
      const offering = demoOffering(offeringKey);
      const visit = this.book({
        person: patient.person,
        branch: slot.branch,
        offering: offeringKey,
        type: isReview ? 'follow_up' : 'treatment',
        date: today,
        start: clockTimeOfMinutes(this.anchor + slot.offset),
        durationMinutes: Math.min(offering.durationMinutes, 30),
        status: slot.status,
        ...(slot.status === 'cancelled' ? { cancelReason: 'rescheduling_later' as const } : {}),
        bookedAt: at({
          date: addDaysToCalendarDate({
            date: today,
            days: -this.faker.number.int({ min: 1, max: 6 }),
          }),
          minutes: 690,
        }),
        reason: isReview ? 'Review after treatment' : `${offering.name} — next session`,
      });
      if (visit !== null && (slot.status === 'completed' || slot.status === 'checked_in')) {
        this.planArrival({ visit, slot, isReview, caseKey: item.key });
      }
    }
  }

  /**
   * A visit on today's floor: checked in ten minutes early, then done or in its lane; a finished
   * session is on the file before the bill (the checkout lane is at the desk, nothing paid yet).
   */
  private planArrival(options: {
    visit: number;
    slot: TodaySlot;
    isReview: boolean;
    caseKey: string;
  }): void {
    const { visit, slot } = options;
    const { today } = this;
    const booked = this.appointments[visit]!;
    const begins = minutesOfClockTime(booked.start);
    const checkedIn = begins - 10;
    if (slot.status === 'completed') {
      this.markCompleted({ appointment: visit, checkInLead: 10 });
    } else {
      let stageChanged = begins + 5;
      if (slot.stage === 'waiting') stageChanged = checkedIn;
      else if (slot.stage === 'checkout') stageChanged = begins + booked.durationMinutes;
      this.appointments[visit] = {
        ...booked,
        checkedInAt: at({ date: today, minutes: checkedIn }),
        visitStage: slot.stage!,
        stageChangedAt: at({ date: today, minutes: stageChanged }),
      };
    }
    const isFinished = slot.status === 'completed' || slot.stage === 'checkout';
    if (!options.isReview && isFinished) {
      const sessions = this.treatments.filter(
        (treatment) => this.appointments[treatment.appointment]!.person === booked.person,
      ).length;
      this.recordTreatment({
        appointment: visit,
        sessionNumber: sessions + 1,
        caseKey: options.caseKey,
      });
    }
    if (slot.status === 'completed') this.bill({ appointment: visit });
    if (slot.stage === 'checkout') this.bill({ appointment: visit, paidShare: 0 });
  }

  /** The next two weeks: every other patient booked again — tomorrow's confirmed. */
  planFuture(): void {
    const { today } = this;
    const tomorrow = workingDay({
      date: addDaysToCalendarDate({ date: today, days: 1 }),
      direction: 1,
    });
    const regulars = this.patients.filter((patient) => patient.status !== 'inactive');
    for (const [index, patient] of regulars.entries()) {
      if (index % 2 === 1) continue;
      const item = demoCase(patient.caseKey);
      const offering = demoOffering(item.treatment);
      const date = workingDay({
        date: addDaysToCalendarDate({ date: today, days: 1 + ((index * 3) % FUTURE_DAYS) }),
        direction: 1,
      });
      this.book({
        person: patient.person,
        branch: patient.branch,
        offering: item.treatment,
        type: 'treatment',
        date,
        start: '11:00',
        preferred: this.faker.helpers.arrayElement([630, 720, 900, 1020]),
        durationMinutes: offering.durationMinutes,
        status: date === tomorrow ? 'confirmed' : 'scheduled',
        bookedAt: at({
          date: addDaysToCalendarDate({
            date: today,
            days: -this.faker.number.int({ min: 0, max: 5 }),
          }),
          minutes: 720,
        }),
        reason: `${offering.name} — next session`,
      });
    }
  }

  /** Enquiries: two that became patients, then the ten still open with their threads. */
  planLeads(): void {
    for (const converted of CONVERTED_LEADS) {
      const patient = this.patients[converted.patient]!;
      const item = demoCase(patient.caseKey);
      const firstSeen = this.people[patient.person]!.firstSeen;
      this.leads.push({
        person: patient.person,
        branch: patient.branch,
        status: 'clinic_visited',
        source: converted.source,
        interests: [item.interest],
        createdAt: firstSeen,
        heldByFrontDesk: false,
        messages: [
          {
            direction: 'received',
            body: this.faker.helpers.arrayElement(
              DEMO_ENQUIRY_MESSAGES[item.interest] ?? DEMO_ENQUIRY_MESSAGES.clinical!,
            ),
            at: firstSeen,
          },
          {
            direction: 'sent',
            body: DEMO_ENQUIRY_REPLIES[0],
            at: replyAt({ received: firstSeen, minutes: 20 }),
          },
        ],
      });
      this.patients[converted.patient] = { ...patient, lead: this.leads.length - 1 };
    }
    for (const [index, plan] of OPEN_LEADS.entries()) this.planOpenLead({ index, plan });
  }

  /**
   * An open enquiry: a WhatsApp message (today's an hour or so before the clock), the desk's
   * reply when it has one, and a snoozed hand follow-up for the one that went quiet.
   */
  private planOpenLead(options: { index: number; plan: (typeof OPEN_LEADS)[number] }): void {
    const { index, plan } = options;
    const { faker, today } = this;
    const receivedAt = at({
      date: addDaysToCalendarDate({ date: today, days: -plan.daysAgo }),
      minutes:
        plan.daysAgo === 0
          ? Math.max(DAY_STARTS, this.anchor - 20 - index * 25)
          : faker.number.int({ min: 600, max: 1140 }),
    });
    const person = this.addPerson({
      sex: faker.datatype.boolean({ probability: 0.75 }) ? 'female' : 'male',
      firstSeen: receivedAt,
    });
    const messages: DemoMessagePlan[] = [
      {
        direction: 'received',
        body: faker.helpers.arrayElement(DEMO_ENQUIRY_MESSAGES[plan.interest]!),
        at: receivedAt,
      },
    ];
    if (plan.replied) {
      messages.push({
        direction: 'sent',
        body: faker.helpers.arrayElement(DEMO_ENQUIRY_REPLIES),
        at: replyAt({ received: receivedAt, minutes: 25 }),
      });
    }
    const branch: DemoBranchKey = index % 3 === 2 ? 'second' : 'main';
    this.leads.push({
      person,
      branch,
      status: plan.status,
      source: faker.helpers.arrayElement([
        'instagram',
        'google',
        'whatsapp',
        'facebook',
        'referral',
      ]),
      interests: [plan.interest],
      createdAt: receivedAt,
      ...(plan.followUpDays === undefined
        ? {}
        : {
            followUpAt: at({
              date: addDaysToCalendarDate({ date: today, days: plan.followUpDays }),
              minutes: plan.followUpDays === 0 ? 990 : 660,
            }),
          }),
      heldByFrontDesk: plan.held,
      messages,
    });
    if (plan.status === 'no_response') {
      this.tasks.push({
        kind: 'follow_up',
        title: `Try ${this.people[person]!.firstName} again — no reply since the quote`,
        owner: 'frontDesk',
        person,
        lead: this.leads.length - 1,
        branch: 'main',
        dueAt: at({ date: addDaysToCalendarDate({ date: today, days: -1 }), minutes: 1020 }),
        status: 'snoozed',
        snoozedUntil: at({ date: addDaysToCalendarDate({ date: today, days: 1 }), minutes: 600 }),
        priority: 'low',
      });
    }
  }

  /**
   * The aftercare calls already made. The app's task rules open each treatment's call (from two
   * days before it is due) and the other rule tasks when `demo-clinic.ts` runs them; the plan
   * records only the calls the team made — those older than two days, two weeks back, without a
   * check-in. Each is created after its treatment, as the rule would have opened it, so the rule
   * stays quiet for it.
   */
  planAftercareHistory(): void {
    const recentFrom = addDaysToCalendarDate({ date: this.today, days: -3 });
    const oldBefore = addDaysToCalendarDate({ date: this.today, days: -14 });
    for (const [index, treatment] of this.treatments.entries()) {
      const visit = this.appointments[treatment.appointment]!;
      const callDate = addDaysToCalendarDate({ date: visit.date, days: 1 });
      const hasCheckIn = this.checkIns.some((checkIn) => checkIn.treatment === index);
      if (callDate > recentFrom || callDate < oldBefore || hasCheckIn) continue;
      this.tasks.push({
        kind: 'rule',
        ruleKey: 'aftercare',
        title: `Aftercare call: ${this.people[visit.person]!.firstName}`,
        why: `${treatment.name} on ${shortCalendarDate(visit.date)}`,
        owner: visit.therapist ?? visit.doctor,
        person: visit.person,
        treatment: index,
        branch: visit.branch,
        createdAt: at({ date: visit.date, minutes: minutesOfClockTime(treatment.at.time) + 5 }),
        dueAt: at({ date: callDate, minutes: 660 }),
        status: 'done',
        outcome: this.faker.helpers.arrayElement(['doing_well', 'happy']),
        resultText: this.faker.helpers.arrayElement([
          'No redness or irritation; happy with the result so far.',
          'Slight dryness, settling. Moisturiser and sunscreen advised.',
          'Doing well; booked the next session.',
        ]),
        resolvedAt: at({ date: callDate, minutes: 700 }),
        priority: 'normal',
      });
    }
  }

  /** The demo login's own list: two to-dos and one done yesterday. */
  planOwnerList(): void {
    const { today } = this;
    const yesterday = addDaysToCalendarDate({ date: today, days: -1 });
    this.tasks.push(
      {
        kind: 'manual',
        title: 'Review the laser package prices for next month',
        owner: 'demo',
        branch: 'main',
        dueAt: at({ date: addDaysToCalendarDate({ date: today, days: 2 }), minutes: 1080 }),
        status: 'open',
        priority: 'normal',
      },
      {
        kind: 'manual',
        title: 'Approve the updated chemical peel consent form',
        owner: 'demo',
        branch: 'main',
        dueAt: at({ date: today, minutes: 1020 }),
        status: 'open',
        priority: 'high',
      },
      {
        kind: 'manual',
        title: 'Order sunscreen samples for the front desk',
        owner: 'demo',
        branch: 'second',
        dueAt: at({ date: yesterday, minutes: 1080 }),
        status: 'done',
        outcome: 'done',
        resolvedAt: at({ date: yesterday, minutes: 1110 }),
        priority: 'low',
      },
    );
  }
}

/** The desk's reply `minutes` after a message, by 21:00 the same day at the latest. */
function replyAt(options: { received: DemoMoment; minutes: number }): DemoMoment {
  const { received, minutes } = options;
  return {
    ...received,
    time: clockTimeOfMinutes(Math.min(minutesOfClockTime(received.time) + minutes, 1260)),
  };
}

/**
 * Builds the demo clinic's whole story from a seeded Faker (`fakerEN_IN`), today's date and the
 * clinic's clock — deterministic for a given seed and day.
 */
export function buildDemoClinicPlan(options: {
  faker: Faker;
  today: string;
  now: string;
}): DemoClinicPlan {
  const planner = new DemoClinicPlanner(options);
  const city = options.faker.helpers.arrayElement(DEMO_CITIES);
  const staff = planner.planStaff();
  const name = planner.nameClinic(staff[0]!);
  const slug = slugOfClinicName(name);
  const branches = planner.planBranches({ city, slug });
  for (let index = 0; index < PATIENT_COUNT; index += 1) planner.planPatient(index);
  planner.planToday();
  planner.planFuture();
  planner.planLeads();
  planner.planAftercareHistory();
  planner.planOwnerList();
  return {
    name,
    slug,
    city,
    branches,
    staff,
    people: planner.people,
    patients: planner.patients,
    leads: planner.leads,
    appointments: planner.appointments,
    notes: planner.notes,
    treatments: planner.treatments,
    invoices: planner.invoices,
    checkIns: planner.checkIns,
    reviews: planner.reviews,
    tasks: planner.tasks,
  };
}
