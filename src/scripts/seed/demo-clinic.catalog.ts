/**
 * The demo clinic's curated vocabulary — what makes `pnpm db:seed:demo-clinic` read like a real
 * Indian skin & hair clinic rather than lorem ipsum. Faker (`fakerEN_IN`) supplies the people; this
 * file supplies what Faker cannot: clinic names that are not a known chain's, real city areas with
 * their PIN codes and landmark roads, a typical metro price list, and the words a dermatologist
 * writes, and the medical store's and the procedure room's shelves. Pure data —
 * `demo-clinic.plan.ts` and `demo-clinic.stock.plan.ts` pick from it with a seeded Faker.
 */
import type { ManufacturerTone } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.constants.js';
import type {
  STOCK_ITEM_CATEGORY_VALUES,
  STOCK_ITEM_MEASURE_UNIT_VALUES,
  STOCK_ITEM_UNIT_VALUES,
} from '@/domains/app/sub-domains/stock/stock-items/stock-items.constants.js';

/** A treatment area of `app.patient_treatments.body_parts`. */
export type DemoBodyPart = 'face' | 'upper_lip' | 'chin' | 'underarm' | 'scalp';

/**
 * Names in Faker's `en_IN` lists that a real clinic's register would not show — surnames of public
 * figures or from elsewhere, and surnames listed as first names. The plan draws again on these.
 */
export const DEMO_UNLIKELY_NAMES: ReadonlySet<string> = new Set([
  'Abbott',
  'Butt',
  'Gandhi',
  'Nehru',
  'Tagore',
  'Pilla',
  'Guneta',
  'Ganaka',
  'Dubashi',
  'Bhadresha',
  'Goswami',
  'Bharadwaj',
]);

/** Stretched transliterations in the same lists (`Aanandinii`, `Baalaaditya`): drawn again too. */
export const DEMO_UNLIKELY_SPELLING = /ii$|aa.*aa|(.)\1\1/i;

/** Name stems with a meaning (Sanskrit/Hindi for skin, glow, radiance) — none is a known chain. */
export const CLINIC_NAME_STEMS = [
  'Tvacha',
  'Aabha',
  'Ojas',
  'Kanti',
  'Nirmala',
  'Prabha',
  'Saumya',
  'Ishika',
] as const;

/** What the clinic calls itself after its name. */
export const CLINIC_NAME_SUFFIXES = [
  'Skin & Hair Clinic',
  'Skin, Hair & Laser Clinic',
  'Dermatology & Aesthetics',
  'Skin Clinic & Laser Centre',
] as const;

/** A neighbourhood the clinic can have a branch in: its PIN code and the road the branch is on. */
export interface DemoArea {
  area: string;
  postalCode: string;
  road: string;
}

/** A city the clinic can be in: its state, GST state code and two areas. */
export interface DemoCity {
  city: string;
  state: string;
  /** The first two digits of a GSTIN registered in the state. */
  gstStateCode: string;
  areas: readonly [DemoArea, DemoArea];
}

/** Real metro areas, their PIN codes and a road each is known for. */
export const DEMO_CITIES: readonly DemoCity[] = [
  {
    city: 'Pune',
    state: 'Maharashtra',
    gstStateCode: '27',
    areas: [
      { area: 'Baner', postalCode: '411045', road: 'Baner Road' },
      { area: 'Koregaon Park', postalCode: '411001', road: 'North Main Road' },
    ],
  },
  {
    city: 'Bengaluru',
    state: 'Karnataka',
    gstStateCode: '29',
    areas: [
      { area: 'Indiranagar', postalCode: '560038', road: '100 Feet Road' },
      { area: 'Koramangala', postalCode: '560034', road: '80 Feet Road' },
    ],
  },
  {
    city: 'Ahmedabad',
    state: 'Gujarat',
    gstStateCode: '24',
    areas: [
      { area: 'Bodakdev', postalCode: '380054', road: 'Judges Bungalow Road' },
      { area: 'Navrangpura', postalCode: '380009', road: 'CG Road' },
    ],
  },
  {
    city: 'Hyderabad',
    state: 'Telangana',
    gstStateCode: '36',
    areas: [
      { area: 'Jubilee Hills', postalCode: '500033', road: 'Road No. 36' },
      { area: 'Gachibowli', postalCode: '500032', road: 'Old Mumbai Highway' },
    ],
  },
  {
    city: 'Surat',
    state: 'Gujarat',
    gstStateCode: '24',
    areas: [
      { area: 'Adajan', postalCode: '395009', road: 'Honey Park Road' },
      { area: 'Vesu', postalCode: '395007', road: 'VIP Road' },
    ],
  },
];

/** Building names a clinic in an Indian city sits in. */
export const DEMO_BUILDINGS = [
  'Shubham Arcade',
  'Krishna Plaza',
  'Sai Prasad Complex',
  'Siddhi Vinayak Heights',
  'Orchid Business Centre',
  'Laxmi Towers',
] as const;

/**
 * The main branch's Google review link (`https://g.page/r/<place code>/review`, the short link
 * Google Business gives a clinic) — what the payment received view and the chat's Review message
 * send. A made-up place code; the second branch has no link, so the app shows both states.
 */
export const DEMO_REVIEW_LINK = 'https://g.page/r/CQdemoclinicEAE/review';

/** The rooms every branch has. */
export const DEMO_ROOMS = ['Consultation room', 'Procedure room', 'Laser room'] as const;

/** The machines every branch has — one per laser the price list uses. */
export const DEMO_MACHINES = [
  'Diode laser',
  'Q-switched Nd:YAG laser',
  'Fractional CO2 laser',
] as const;

/** One service on the clinic's price list (`app.offerings`), at a typical metro clinic's rate. */
export interface DemoOffering {
  key: DemoOfferingKey;
  name: string;
  category: 'consultation' | 'treatment' | 'lhr';
  specialty: 'skin' | 'hair';
  tone: string;
  /** Rupees. */
  price: number;
  durationMinutes: number;
  /** Medical consultations are GST-exempt; cosmetic services carry 18%. */
  gstPercent: 0 | 18;
  /** The skin template's therapy type (`parameters.type`); absent for a consultation. */
  therapyType?: 'laser' | 'peel' | 'facial' | 'injectable' | 'microneedling';
  /** The branch machine it runs on, when it needs one. */
  usesMachine?: boolean;
}

/** The services the plan books and bills. */
export type DemoOfferingKey =
  | 'consultation'
  | 'followUp'
  | 'glycolicPeel'
  | 'hydraFacial'
  | 'carbonLaser'
  | 'lhrFace'
  | 'lhrUnderarms'
  | 'prpHair'
  | 'microneedling'
  | 'co2Scars'
  | 'underEyePrp';

/** The clinic's price list. */
export const DEMO_OFFERINGS: readonly DemoOffering[] = [
  {
    key: 'consultation',
    name: 'Dermatologist consultation',
    category: 'consultation',
    specialty: 'skin',
    tone: 'sky',
    price: 800,
    durationMinutes: 15,
    gstPercent: 0,
  },
  {
    key: 'followUp',
    name: 'Follow-up consultation',
    category: 'consultation',
    specialty: 'skin',
    tone: 'sky',
    price: 400,
    durationMinutes: 10,
    gstPercent: 0,
  },
  {
    key: 'glycolicPeel',
    name: 'Glycolic chemical peel',
    category: 'treatment',
    specialty: 'skin',
    tone: 'peach',
    price: 2500,
    durationMinutes: 30,
    gstPercent: 18,
    therapyType: 'peel',
  },
  {
    key: 'hydraFacial',
    name: 'Hydra medi-facial',
    category: 'treatment',
    specialty: 'skin',
    tone: 'mint',
    price: 4500,
    durationMinutes: 45,
    gstPercent: 18,
    therapyType: 'facial',
  },
  {
    key: 'carbonLaser',
    name: 'Carbon laser facial',
    category: 'treatment',
    specialty: 'skin',
    tone: 'slate',
    price: 3500,
    durationMinutes: 45,
    gstPercent: 18,
    therapyType: 'laser',
    usesMachine: true,
  },
  {
    key: 'lhrFace',
    name: 'Laser hair reduction – full face',
    category: 'lhr',
    specialty: 'skin',
    tone: 'lav',
    price: 3000,
    durationMinutes: 30,
    gstPercent: 18,
    therapyType: 'laser',
    usesMachine: true,
  },
  {
    key: 'lhrUnderarms',
    name: 'Laser hair reduction – underarms',
    category: 'lhr',
    specialty: 'skin',
    tone: 'lav',
    price: 2000,
    durationMinutes: 20,
    gstPercent: 18,
    therapyType: 'laser',
    usesMachine: true,
  },
  {
    key: 'prpHair',
    name: 'PRP hair therapy',
    category: 'treatment',
    specialty: 'hair',
    tone: 'butter',
    price: 6000,
    durationMinutes: 60,
    gstPercent: 18,
    therapyType: 'injectable',
  },
  {
    key: 'microneedling',
    name: 'Microneedling with growth-factor serum',
    category: 'treatment',
    specialty: 'skin',
    tone: 'blush',
    price: 5000,
    durationMinutes: 60,
    gstPercent: 18,
    therapyType: 'microneedling',
  },
  {
    key: 'co2Scars',
    name: 'Fractional CO2 laser for acne scars',
    category: 'treatment',
    specialty: 'skin',
    tone: 'plum',
    price: 7000,
    durationMinutes: 45,
    gstPercent: 18,
    therapyType: 'laser',
    usesMachine: true,
  },
  {
    key: 'underEyePrp',
    name: 'Under-eye PRP',
    category: 'treatment',
    specialty: 'skin',
    tone: 'butter',
    price: 5500,
    durationMinutes: 45,
    gstPercent: 18,
    therapyType: 'injectable',
  },
];

/** A patient's condition: what they came in with, what the doctor found, and the plan. */
export interface DemoCase {
  key: string;
  /** `app.patients.types`. */
  patientType: 'aesthetic' | 'clinical' | 'lhr';
  /** `app.leads.interests` for an enquiry about it. */
  interest: 'clinical' | 'peel' | 'lhr' | 'hydrafacial' | 'prp' | 'others';
  complaint: string;
  finding: string;
  diagnosis: string;
  suggestion: string;
  /** The treatment booked for it, session after session. */
  treatment: DemoOfferingKey;
  bodyParts: readonly DemoBodyPart[];
  /** A check-in after a session: how it is going and what comes next. */
  progress: string;
  nextPlan: string;
  /** Who the case suits — LHR for facial hair and female-pattern hair loss are women's cases. */
  sex: 'female' | 'any';
}

/** The conditions a skin & hair clinic sees week in, week out. */
export const DEMO_CASES: readonly DemoCase[] = [
  {
    key: 'acne',
    patientType: 'clinical',
    interest: 'peel',
    complaint: 'Breakouts on the cheeks and jawline for six months, worse before periods.',
    finding:
      'Inflammatory papules and a few pustules over both cheeks and jaw; closed comedones on the forehead.',
    diagnosis: 'Acne vulgaris, grade 2',
    suggestion: 'Glycolic peel every 3 weeks for 4 sessions with topical adapalene at night.',
    treatment: 'glycolicPeel',
    bodyParts: ['face'],
    progress: 'Fewer new breakouts since the second peel; mild dryness for two days after.',
    nextPlan: 'Continue adapalene and sunscreen; third peel in three weeks.',
    sex: 'any',
  },
  {
    key: 'melasma',
    patientType: 'aesthetic',
    interest: 'peel',
    complaint: 'Dark patches on both cheeks, worse after the summer.',
    finding:
      'Symmetrical light-brown macules over the malar area; epidermal pattern on Wood’s lamp.',
    diagnosis: 'Melasma, epidermal',
    suggestion:
      'Glycolic peels every 3 weeks alongside a triple-combination cream and strict sun protection.',
    treatment: 'glycolicPeel',
    bodyParts: ['face'],
    progress: 'Patches visibly lighter; sticking to sunscreen twice a day.',
    nextPlan: 'Next peel in three weeks; taper the cream to alternate nights.',
    sex: 'female',
  },
  {
    key: 'hairLoss',
    patientType: 'clinical',
    interest: 'prp',
    complaint: 'Hair fall for three months and a widening parting.',
    finding: 'Diffuse thinning over the crown; hair-pull test positive; scalp healthy.',
    diagnosis: 'Female pattern hair loss, Ludwig grade 1',
    suggestion:
      'PRP every 4 weeks for 4 sessions with topical minoxidil 5%; check ferritin and thyroid.',
    treatment: 'prpHair',
    bodyParts: ['scalp'],
    progress: 'Hair fall has reduced noticeably; new baby hair along the parting.',
    nextPlan: 'Continue minoxidil; next PRP session in four weeks.',
    sex: 'female',
  },
  {
    key: 'facialHair',
    patientType: 'lhr',
    interest: 'lhr',
    complaint: 'Unwanted hair on the upper lip and chin; threading every two weeks.',
    finding: 'Coarse terminal hair over the upper lip and chin; skin type IV.',
    diagnosis: 'Hirsutism, mild (modified Ferriman–Gallwey 9)',
    suggestion:
      'Diode laser hair reduction every 4–6 weeks for 6 sessions; no threading in between.',
    treatment: 'lhrFace',
    bodyParts: ['upper_lip', 'chin'],
    progress: 'Regrowth is finer and slower after the second session.',
    nextPlan: 'Third session in five weeks; shave only, no waxing or threading.',
    sex: 'female',
  },
  {
    key: 'underarms',
    patientType: 'lhr',
    interest: 'lhr',
    complaint: 'Wants permanent underarm hair reduction; razor bumps after shaving.',
    finding: 'Dense terminal hair in both axillae with mild post-shaving folliculitis.',
    diagnosis: 'Pseudofolliculitis, axillary',
    suggestion: 'Diode laser hair reduction every 4–6 weeks for 6 sessions.',
    treatment: 'lhrUnderarms',
    bodyParts: ['underarm'],
    progress: 'About half the hair has gone; no more razor bumps.',
    nextPlan: 'Next session in six weeks.',
    sex: 'any',
  },
  {
    key: 'scars',
    patientType: 'clinical',
    interest: 'clinical',
    complaint: 'Acne scars on both cheeks left from college.',
    finding: 'Rolling and boxcar scars over both cheeks; no active acne.',
    diagnosis: 'Post-acne atrophic scars',
    suggestion: 'Fractional CO2 laser every 6 weeks for 3 sessions, then microneedling to finish.',
    treatment: 'co2Scars',
    bodyParts: ['face'],
    progress: 'Skin texture smoother; redness settled in four days.',
    nextPlan: 'Second CO2 session in six weeks; strict sunscreen meanwhile.',
    sex: 'any',
  },
  {
    key: 'dullSkin',
    patientType: 'aesthetic',
    interest: 'hydrafacial',
    complaint: 'Dull, tired-looking skin before a family wedding.',
    finding: 'Uneven tone, dehydrated skin and enlarged pores over the nose and cheeks.',
    diagnosis: 'Dehydrated skin with uneven tone',
    suggestion: 'Hydra medi-facial every 2 weeks for 3 sessions, carbon laser before the event.',
    treatment: 'hydraFacial',
    bodyParts: ['face'],
    progress: 'Skin looks brighter and feels hydrated; very happy with the glow.',
    nextPlan: 'Last facial a week before the wedding.',
    sex: 'any',
  },
  {
    key: 'darkCircles',
    patientType: 'aesthetic',
    interest: 'prp',
    complaint: 'Dark circles that do not go with sleep or creams.',
    finding: 'Periorbital pigmentation with mild hollowing under both eyes.',
    diagnosis: 'Periorbital hyperpigmentation',
    suggestion: 'Under-eye PRP monthly for 3 sessions with a vitamin C eye serum.',
    treatment: 'underEyePrp',
    bodyParts: ['face'],
    progress: 'Under-eye area looks less hollow; slight bruising faded in two days.',
    nextPlan: 'Second session in four weeks.',
    sex: 'any',
  },
];

/** What an enquiry's first WhatsApp message says, by interest. */
export const DEMO_ENQUIRY_MESSAGES: Readonly<Record<string, readonly string[]>> = {
  lhr: [
    'Hi, what is the price for laser hair removal for the full face? How many sessions are needed?',
    'Hello, do you do underarm laser hair reduction? Is it painful?',
  ],
  peel: [
    'Hi, I have acne marks on my cheeks. Do chemical peels help? What is the cost?',
    'Hello, is a peel safe for pigmentation? I have a function next month.',
  ],
  prp: [
    'Hi, I am facing a lot of hair fall. Do you do PRP and what are the charges?',
    'Hello, how much is PRP for dark circles?',
  ],
  hydrafacial: [
    'Hi, I want a facial for glowing skin before my sister’s wedding. Which one do you suggest?',
  ],
  clinical: [
    'Hello, I want to book a dermatologist consultation for acne scars. Is Saturday free?',
  ],
};

/** A front-desk reply to an enquiry. */
export const DEMO_ENQUIRY_REPLIES = [
  'Hello! Thank you for reaching out. The doctor will first see you for a consultation (₹800), then suggest the plan. Shall I book a slot this week?',
  'Hi! Yes, we do. A consultation is ₹800 and the treatment price depends on the plan. Which day suits you?',
] as const;

/** What patients write in a review, by rating. */
export const DEMO_REVIEW_TEXTS: Readonly<Record<5 | 4 | 3, readonly string[]>> = {
  5: [
    'Very professional clinic. The doctor explained everything patiently and my acne is finally under control.',
    'Excellent experience. Clean, on time and the staff are very polite. My pigmentation has reduced a lot.',
    'I was nervous about laser but the therapist made it painless. Results after two sessions already!',
    'Best skin clinic in the area. No pushy selling, honest advice.',
  ],
  4: [
    'Good results with PRP, hair fall is much less. Waiting time was a bit long on Saturday.',
    'Nice staff and good treatment. Parking is difficult in the evening.',
  ],
  3: ['Treatment was fine but I had to wait 40 minutes beyond my appointment time.'],
};

/** What a doctor notes on an appointment, by type. */
export const DEMO_APPOINTMENT_REASONS = {
  consultation: 'First consultation',
  follow_up: 'Review after treatment',
  treatment: 'Treatment session',
} as const;

/** Allergies a handful of patients have on file. */
export const DEMO_ALLERGIES = ['Sulfa drugs', 'Penicillin', 'Lidocaine (mild)'] as const;

/** A brand on the medical store's packs (`app.manufacturers`). */
export type DemoManufacturerKey =
  | 'sunPharma'
  | 'fixderma'
  | 'galderma'
  | 'johnson'
  | 'drReddys'
  | 'cipla'
  | 'glenmark';

/** A manufacturer as the store keeps it — upper case, with its chip colour. */
export interface DemoManufacturer {
  key: DemoManufacturerKey;
  name: string;
  tone: ManufacturerTone;
}

/** The brands an Indian skin clinic's store stocks. */
export const DEMO_MANUFACTURERS: readonly DemoManufacturer[] = [
  { key: 'sunPharma', name: 'SUN PHARMA', tone: 'butter' },
  { key: 'fixderma', name: 'FIXDERMA', tone: 'sky' },
  { key: 'galderma', name: 'GALDERMA', tone: 'lav' },
  { key: 'johnson', name: 'JOHNSON & JOHNSON', tone: 'blush' },
  { key: 'drReddys', name: "DR. REDDY'S LABORATORIES", tone: 'sage' },
  { key: 'cipla', name: 'CIPLA', tone: 'mint' },
  { key: 'glenmark', name: 'GLENMARK', tone: 'sky' },
];

/** An agency the store buys from (`app.suppliers`). */
export type DemoSupplierKey = 'ganesh' | 'omSai' | 'city';

/** A supplier: its name (the city agency takes the clinic's city), the brands it carries and its rates. */
export interface DemoSupplier {
  key: DemoSupplierKey;
  /** `{city}` is the clinic's city. */
  name: string;
  manufacturers: readonly DemoManufacturerKey[];
  /** Its rate against a medicine's trade rate (the city agency is a little cheaper, and slower). */
  rateFactor: number;
  leadDays: number;
}

/** The three agencies — every brand has at least one. */
export const DEMO_SUPPLIERS: readonly DemoSupplier[] = [
  {
    key: 'ganesh',
    name: 'Shree Ganesh Pharma Distributors',
    manufacturers: ['sunPharma', 'fixderma', 'galderma', 'johnson'],
    rateFactor: 1,
    leadDays: 1,
  },
  {
    key: 'omSai',
    name: 'Om Sai Medical Agencies',
    manufacturers: ['drReddys', 'cipla', 'glenmark'],
    rateFactor: 1,
    leadDays: 2,
  },
  {
    key: 'city',
    name: '{city} Medico Distributors',
    manufacturers: ['galderma', 'cipla', 'sunPharma'],
    rateFactor: 0.97,
    leadDays: 3,
  },
];

/** A medicine the store sells. */
export type DemoMedicineKey =
  | 'suncros'
  | 'shadow'
  | 'adaferin'
  | 'retinoA'
  | 'mintop'
  | 'tugain'
  | 'isotroin'
  | 'cleanser'
  | 'moisturiser'
  | 'candid'
  | 'momate'
  | 'nizral';

/** A medicine on the store's shelf (`app.medicines`) and how much of it the store had to start with. */
export interface DemoMedicine {
  key: DemoMedicineKey;
  name: string;
  composition: string;
  manufacturer: DemoManufacturerKey;
  isPrescriptionOnly: boolean;
  /** Rupees per pack, GST inside — what a sale bills. */
  mrp: number;
  /** Medicines carry 5% (the GST rates since September 2025); skin-care products 18%. */
  gstPercent: 5 | 18;
  minStock: number;
  maxStock: number;
  /** What an agency charges for a pack, in rupees, before its own rate factor. */
  tradeRate: number;
  /** Packs in hand when the store's records begin, and the month that batch expires (from this month). */
  opening: { quantity: number; expiresInMonths: number };
  /** The store's near-expiry discount on it, percent. */
  nearExpiryDiscountPercent?: number;
  /** How its maker's batch numbers start. */
  batchPrefix: string;
  /** Packs a sale usually takes. */
  packsPerSale: number;
}

/**
 * The store's medicines at metro MRPs. Their opening stock tells the store's story: Retino-A's old
 * batch expires next month (sold at 20% off), Suncros' the month after; Momate's batch expired last
 * month and goes back to its agency, so it is out and on order; Fixderma Shadow and Nizral sit at
 * their reorder level.
 */
export const DEMO_MEDICINES: readonly DemoMedicine[] = [
  {
    key: 'suncros',
    name: 'Suncros Aqualite SPF 50 Gel 50 g',
    composition: 'Broad-spectrum sunscreen, SPF 50 PA+++',
    manufacturer: 'sunPharma',
    isPrescriptionOnly: false,
    mrp: 695,
    gstPercent: 18,
    minStock: 4,
    maxStock: 20,
    tradeRate: 520,
    opening: { quantity: 6, expiresInMonths: 2 },
    batchPrefix: 'SAG',
    packsPerSale: 1,
  },
  {
    key: 'shadow',
    name: 'Fixderma Shadow SPF 50+ Gel 75 g',
    composition: 'Broad-spectrum sunscreen, SPF 50+',
    manufacturer: 'fixderma',
    isPrescriptionOnly: false,
    mrp: 799,
    gstPercent: 18,
    minStock: 4,
    maxStock: 16,
    tradeRate: 600,
    opening: { quantity: 4, expiresInMonths: 11 },
    batchPrefix: 'FXS',
    packsPerSale: 1,
  },
  {
    key: 'adaferin',
    name: 'Adaferin Gel 0.1% 15 g',
    composition: 'Adapalene 0.1% w/w',
    manufacturer: 'galderma',
    isPrescriptionOnly: true,
    mrp: 433,
    gstPercent: 5,
    minStock: 3,
    maxStock: 15,
    tradeRate: 325,
    opening: { quantity: 5, expiresInMonths: 9 },
    batchPrefix: 'ADF',
    packsPerSale: 1,
  },
  {
    key: 'retinoA',
    name: 'Retino-A 0.025% Cream 20 g',
    composition: 'Tretinoin 0.025% w/w',
    manufacturer: 'johnson',
    isPrescriptionOnly: true,
    mrp: 365,
    gstPercent: 5,
    minStock: 3,
    maxStock: 12,
    tradeRate: 274,
    opening: { quantity: 10, expiresInMonths: 1 },
    nearExpiryDiscountPercent: 20,
    batchPrefix: 'RTA',
    packsPerSale: 1,
  },
  {
    key: 'mintop',
    name: 'Mintop 5% Solution 60 ml',
    composition: 'Minoxidil 5% w/v',
    manufacturer: 'drReddys',
    isPrescriptionOnly: true,
    mrp: 799,
    gstPercent: 5,
    minStock: 3,
    maxStock: 12,
    tradeRate: 599,
    opening: { quantity: 4, expiresInMonths: 14 },
    batchPrefix: 'MNT',
    packsPerSale: 1,
  },
  {
    key: 'tugain',
    name: 'Tugain 5% Solution 60 ml',
    composition: 'Minoxidil 5% w/v',
    manufacturer: 'cipla',
    isPrescriptionOnly: true,
    mrp: 745,
    gstPercent: 5,
    minStock: 2,
    maxStock: 10,
    tradeRate: 559,
    opening: { quantity: 3, expiresInMonths: 12 },
    batchPrefix: 'TUG',
    packsPerSale: 1,
  },
  {
    key: 'isotroin',
    name: 'Isotroin 20 mg Capsules (10)',
    composition: 'Isotretinoin 20 mg',
    manufacturer: 'cipla',
    isPrescriptionOnly: true,
    mrp: 285,
    gstPercent: 5,
    minStock: 4,
    maxStock: 20,
    tradeRate: 214,
    opening: { quantity: 6, expiresInMonths: 16 },
    batchPrefix: 'ISO',
    packsPerSale: 2,
  },
  {
    key: 'cleanser',
    name: 'Cetaphil Gentle Skin Cleanser 125 ml',
    composition: 'Soap-free cleanser for sensitive skin',
    manufacturer: 'galderma',
    isPrescriptionOnly: false,
    mrp: 499,
    gstPercent: 18,
    minStock: 3,
    maxStock: 12,
    tradeRate: 374,
    opening: { quantity: 4, expiresInMonths: 18 },
    batchPrefix: 'CGC',
    packsPerSale: 1,
  },
  {
    key: 'moisturiser',
    name: 'Cetaphil Moisturising Cream 80 g',
    composition: 'Glycerin, petrolatum and sweet almond oil',
    manufacturer: 'galderma',
    isPrescriptionOnly: false,
    mrp: 545,
    gstPercent: 18,
    minStock: 3,
    maxStock: 12,
    tradeRate: 409,
    opening: { quantity: 5, expiresInMonths: 15 },
    batchPrefix: 'CMC',
    packsPerSale: 1,
  },
  {
    key: 'candid',
    name: 'Candid Dusting Powder 100 g',
    composition: 'Clotrimazole 1% w/w',
    manufacturer: 'glenmark',
    isPrescriptionOnly: false,
    mrp: 165,
    gstPercent: 5,
    minStock: 4,
    maxStock: 20,
    tradeRate: 124,
    opening: { quantity: 6, expiresInMonths: 20 },
    batchPrefix: 'CDP',
    packsPerSale: 2,
  },
  {
    key: 'momate',
    name: 'Momate Cream 15 g',
    composition: 'Mometasone furoate 0.1% w/w',
    manufacturer: 'glenmark',
    isPrescriptionOnly: true,
    mrp: 232,
    gstPercent: 5,
    minStock: 3,
    maxStock: 12,
    tradeRate: 174,
    opening: { quantity: 4, expiresInMonths: -1 },
    batchPrefix: 'MOM',
    packsPerSale: 1,
  },
  {
    key: 'nizral',
    name: 'Nizral 2% Shampoo 100 ml',
    composition: 'Ketoconazole 2% w/v',
    manufacturer: 'johnson',
    isPrescriptionOnly: false,
    mrp: 389,
    gstPercent: 5,
    minStock: 2,
    maxStock: 10,
    tradeRate: 292,
    opening: { quantity: 2, expiresInMonths: 10 },
    batchPrefix: 'NZS',
    packsPerSale: 1,
  },
];

/** What the doctor sends a patient to the store for, by case (`DEMO_CASES` keys). */
export const DEMO_CASE_MEDICINES: Readonly<Record<string, readonly DemoMedicineKey[]>> = {
  acne: ['adaferin', 'cleanser', 'suncros', 'isotroin'],
  melasma: ['suncros', 'retinoA', 'moisturiser', 'shadow'],
  hairLoss: ['mintop', 'tugain', 'nizral'],
  facialHair: ['suncros', 'moisturiser'],
  underarms: ['candid', 'moisturiser'],
  scars: ['retinoA', 'suncros', 'moisturiser'],
  dullSkin: ['cleanser', 'moisturiser', 'shadow'],
  darkCircles: ['moisturiser', 'suncros'],
};

/** What a medical representative of each brand leaves and says on a visit. */
export const DEMO_REP_VISITS: Readonly<
  Partial<Record<DemoManufacturerKey, readonly { samples: string; notes: string }[]>>
> = {
  galderma: [
    {
      samples: 'Cetaphil cleanser minis ×10',
      notes: 'Walked through the new Cetaphil hydrating range; left the clinic-pack price list.',
    },
    {
      samples: 'Adaferin 5 g tubes ×6',
      notes: 'Asked how the adapalene starters are doing; offered a 10 + 1 scheme on Adaferin.',
    },
  ],
  sunPharma: [
    {
      samples: 'Suncros Aqualite sachets ×20',
      notes: 'Introduced the tinted Suncros variant; sachets for patients after peels and lasers.',
    },
    {
      samples: 'Suncros Aqualite sachets ×15',
      notes:
        'Checked our short-dated Suncros stock; will ask the agency to take back what expires.',
    },
  ],
  drReddys: [
    {
      samples: 'Mintop 5% sample bottles ×4',
      notes: 'Shared the minoxidil foam data for patients who find the solution sticky.',
    },
  ],
};

/** A vendor of the clinic's own consumables (`app.stock_vendors`) — never the store's agencies. */
export type DemoStockVendorKey = 'medisafe' | 'dermaPro' | 'hygiene';

/** The clinic's three consumables vendors. */
export const DEMO_STOCK_VENDORS: readonly {
  key: DemoStockVendorKey;
  name: string;
  billPrefix: string;
}[] = [
  { key: 'medisafe', name: 'Medisafe Surgicals', billPrefix: 'MS' },
  { key: 'dermaPro', name: 'DermaPro Aesthetic Supplies', billPrefix: 'DPA' },
  { key: 'hygiene', name: 'Hygiene Point Enterprises', billPrefix: 'HPE' },
];

/** One consumable or piece of equipment the clinic keeps. */
export type DemoStockItemKey =
  | 'gloves'
  | 'gauze'
  | 'masks'
  | 'sheetRoll'
  | 'alcoholPads'
  | 'glycolicPeel'
  | 'salicylicPeel'
  | 'hydraSerum'
  | 'carbonLotion'
  | 'coolingGel'
  | 'numbingCream'
  | 'prpKit'
  | 'sheetMasks'
  | 'eyeShields';

/** A clinic stock item (`app.stock_items`), what it starts with and what uses it. */
export interface DemoStockItem {
  key: DemoStockItemKey;
  name: string;
  category: Exclude<(typeof STOCK_ITEM_CATEGORY_VALUES)[number], 'other'>;
  unit: (typeof STOCK_ITEM_UNIT_VALUES)[number];
  /** "1 box = 100 pcs". */
  size?: { perUnit: number; measure: (typeof STOCK_ITEM_MEASURE_UNIT_VALUES)[number] };
  minQuantity: number;
  maxQuantity: number;
  usagePerWeek: number;
  vendor: DemoStockVendorKey;
  /** In hand when the records begin. */
  opening: number;
  /** Rupees per unit from its vendor. */
  rate: number;
  /** Taken out each week for the day-to-day procedures (gloves, gauze, sheets). */
  isWeekly?: boolean;
  /** What one treatment session uses, by the offering it is for. */
  perSession?: Readonly<Partial<Record<DemoOfferingKey, number>>>;
}

/**
 * The procedure room's shelf. The carbon lotion and the laser eye shields sit at their reorder
 * level, and the last of the salicylic peel goes on an acne touch-up, so the low list shows all
 * three.
 */
export const DEMO_STOCK_ITEMS: readonly DemoStockItem[] = [
  {
    key: 'gloves',
    name: 'Nitrile examination gloves (medium)',
    category: 'consumables',
    unit: 'box',
    size: { perUnit: 100, measure: 'pcs' },
    minQuantity: 2,
    maxQuantity: 12,
    usagePerWeek: 1.5,
    vendor: 'medisafe',
    opening: 5,
    rate: 450,
    isWeekly: true,
  },
  {
    key: 'gauze',
    name: 'Sterile gauze swabs 10 × 10 cm',
    category: 'consumables',
    unit: 'pack',
    size: { perUnit: 100, measure: 'pcs' },
    minQuantity: 2,
    maxQuantity: 10,
    usagePerWeek: 1,
    vendor: 'medisafe',
    opening: 4,
    rate: 180,
    isWeekly: true,
  },
  {
    key: 'masks',
    name: 'Three-ply surgical masks',
    category: 'consumables',
    unit: 'box',
    size: { perUnit: 50, measure: 'pcs' },
    minQuantity: 2,
    maxQuantity: 10,
    usagePerWeek: 1,
    vendor: 'hygiene',
    opening: 4,
    rate: 150,
    isWeekly: true,
  },
  {
    key: 'sheetRoll',
    name: 'Disposable bed sheet roll',
    category: 'consumables',
    unit: 'roll',
    minQuantity: 2,
    maxQuantity: 8,
    usagePerWeek: 1,
    vendor: 'hygiene',
    opening: 4,
    rate: 320,
    isWeekly: true,
  },
  {
    key: 'alcoholPads',
    name: 'Alcohol prep pads',
    category: 'consumables',
    unit: 'box',
    size: { perUnit: 100, measure: 'pcs' },
    minQuantity: 1,
    maxQuantity: 6,
    usagePerWeek: 0.5,
    vendor: 'medisafe',
    opening: 3,
    rate: 120,
    isWeekly: true,
  },
  {
    key: 'glycolicPeel',
    name: 'Glycolic acid peel 35%',
    category: 'peels',
    unit: 'bottle',
    size: { perUnit: 30, measure: 'ml' },
    minQuantity: 1,
    maxQuantity: 4,
    usagePerWeek: 0.3,
    vendor: 'dermaPro',
    opening: 1.5,
    rate: 1850,
    perSession: { glycolicPeel: 0.1 },
  },
  {
    key: 'salicylicPeel',
    name: 'Salicylic acid peel 20%',
    category: 'peels',
    unit: 'bottle',
    size: { perUnit: 30, measure: 'ml' },
    minQuantity: 1,
    maxQuantity: 3,
    usagePerWeek: 0.1,
    vendor: 'dermaPro',
    opening: 0.3,
    rate: 1650,
  },
  {
    key: 'hydraSerum',
    name: 'Hyaluronic serum for hydra facials',
    category: 'creams_serums',
    unit: 'bottle',
    size: { perUnit: 50, measure: 'ml' },
    minQuantity: 1,
    maxQuantity: 4,
    usagePerWeek: 0.3,
    vendor: 'dermaPro',
    opening: 1,
    rate: 2200,
    perSession: { hydraFacial: 0.1 },
  },
  {
    key: 'carbonLotion',
    name: 'Carbon lotion for laser facials',
    category: 'creams_serums',
    unit: 'jar',
    size: { perUnit: 50, measure: 'g' },
    minQuantity: 1,
    maxQuantity: 3,
    usagePerWeek: 0.1,
    vendor: 'dermaPro',
    opening: 0.6,
    rate: 1400,
  },
  {
    key: 'coolingGel',
    name: 'Cooling gel for laser',
    category: 'consumables',
    unit: 'bottle',
    size: { perUnit: 250, measure: 'ml' },
    minQuantity: 2,
    maxQuantity: 8,
    usagePerWeek: 1,
    vendor: 'dermaPro',
    opening: 3,
    rate: 260,
    perSession: { lhrFace: 0.08, lhrUnderarms: 0.06, co2Scars: 0.08 },
  },
  {
    key: 'numbingCream',
    name: 'Lidocaine–prilocaine numbing cream',
    category: 'creams_serums',
    unit: 'tube',
    size: { perUnit: 30, measure: 'g' },
    minQuantity: 2,
    maxQuantity: 8,
    usagePerWeek: 0.75,
    vendor: 'medisafe',
    opening: 2,
    rate: 340,
    perSession: { co2Scars: 0.25, underEyePrp: 0.1 },
  },
  {
    key: 'prpKit',
    name: 'PRP kit with separator gel tube',
    category: 'consumables',
    unit: 'kit',
    minQuantity: 3,
    maxQuantity: 12,
    usagePerWeek: 1.5,
    vendor: 'medisafe',
    opening: 5,
    rate: 950,
    perSession: { prpHair: 1, underEyePrp: 1 },
  },
  {
    key: 'sheetMasks',
    name: 'Hydrating sheet mask',
    category: 'masks',
    unit: 'piece',
    minQuantity: 10,
    maxQuantity: 40,
    usagePerWeek: 4,
    vendor: 'dermaPro',
    opening: 20,
    rate: 85,
    perSession: { glycolicPeel: 1, hydraFacial: 1 },
  },
  {
    key: 'eyeShields',
    name: 'Laser safety eye shields',
    category: 'equipment',
    unit: 'pair',
    minQuantity: 2,
    maxQuantity: 4,
    usagePerWeek: 0,
    vendor: 'medisafe',
    opening: 2,
    rate: 1200,
  },
];
