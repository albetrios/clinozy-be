/**
 * The demo clinic's curated vocabulary — what makes `pnpm db:seed:demo-clinic` read like a real
 * Indian skin & hair clinic rather than lorem ipsum. Faker (`fakerEN_IN`) supplies the people; this
 * file supplies what Faker cannot: clinic names that are not a known chain's, real city areas with
 * their PIN codes and landmark roads, a typical metro price list, and the words a dermatologist
 * writes. Pure data — `demo-clinic.plan.ts` picks from it with a seeded Faker.
 */

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
