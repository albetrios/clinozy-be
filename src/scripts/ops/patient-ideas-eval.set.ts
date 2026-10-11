import type {
  IdeaOffering,
  PatientIdeasSummary,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.types.js';

/** One evaluation case: a de-identified summary and the ideas a clinic counsellor would accept. */
export interface PatientIdeasEvalCase {
  name: string;
  summary: PatientIdeasSummary;
  /** Menu offerings already in the plan — never to be suggested. */
  plannedPublicIds: string[];
  /** The offerings a counsellor would accept for this patient, any order. */
  acceptedPublicIds: string[];
}

/** A menu offering of the evaluation clinic. */
function offering({
  index,
  name,
  category,
  price,
  sessions = 1,
}: {
  index: number;
  name: string;
  category: string;
  price: string;
  sessions?: number | undefined;
}): IdeaOffering {
  return {
    id: index,
    publicId: `ofr_eval${String(index).padStart(17, '0')}`,
    name,
    category,
    sessions,
    price,
  };
}

/** The evaluation clinic's active menu (a dermatology and aesthetics clinic, as the launch's). */
export const EVAL_MENU: readonly IdeaOffering[] = [
  offering({ index: 1, name: 'Consultation', category: 'Consultation', price: '500.00' }),
  offering({ index: 2, name: 'Chemical peel', category: 'Skin', price: '2500.00' }),
  offering({
    index: 3,
    name: 'Acne peel package',
    category: 'Skin',
    price: '9000.00',
    sessions: 4,
  }),
  offering({ index: 4, name: 'Hydrafacial', category: 'Skin', price: '4500.00' }),
  offering({ index: 5, name: 'Microneedling', category: 'Skin', price: '6000.00' }),
  offering({ index: 6, name: 'PRP for hair', category: 'Hair', price: '6000.00' }),
  offering({
    index: 7,
    name: 'PRP hair package',
    category: 'Hair',
    price: '20000.00',
    sessions: 4,
  }),
  offering({ index: 8, name: 'GFC for hair', category: 'Hair', price: '9000.00' }),
  offering({
    index: 9,
    name: 'Laser hair reduction — full face',
    category: 'Laser',
    price: '3500.00',
  }),
  offering({
    index: 10,
    name: 'Laser hair reduction package — full face',
    category: 'Laser',
    price: '18000.00',
    sessions: 6,
  }),
  offering({
    index: 11,
    name: 'Q-switch laser for pigmentation',
    category: 'Laser',
    price: '5000.00',
  }),
  offering({ index: 12, name: 'Botox — forehead', category: 'Injectables', price: '12000.00' }),
  offering({
    index: 13,
    name: 'Dermal filler — under eye',
    category: 'Injectables',
    price: '22000.00',
  }),
  offering({ index: 14, name: 'Mole removal', category: 'Procedures', price: '3000.00' }),
  offering({ index: 15, name: 'Skin tag removal', category: 'Procedures', price: '1500.00' }),
];

/**
 * Offerings the clinic no longer runs — never in the menu Claude sees; an answer naming one is a
 * violation ("never inactive").
 */
export const EVAL_INACTIVE_PUBLIC_IDS: readonly string[] = [
  'ofr_evalinactive0000000001',
  'ofr_evalinactive0000000002',
];

/** The menu's public id of a name, for the cases below. */
function id(name: string): string {
  const found = EVAL_MENU.find((item) => item.name === name);
  if (!found) throw new Error(`no offering ${name}`);
  return found.publicId;
}

/** A summary with defaults — a first-visit patient with nothing on record. */
function summary(parts: Partial<PatientIdeasSummary>): PatientIdeasSummary {
  return {
    complaints: [],
    diagnoses: [],
    treatments: [],
    packages: [],
    completed_visits: 0,
    already_planned: [],
    ...parts,
  };
}

/**
 * About twenty de-identified patients, each with the ideas a clinic counsellor would accept (task
 * I2). Concern labels, catalogue names and months only — what the ideas worker sends (PI6). Grown
 * with the clinic's advisor; re-run whenever the prompt or the model changes.
 */
export const PATIENT_IDEAS_EVAL_SET: readonly PatientIdeasEvalCase[] = [
  {
    name: 'first visit, acne',
    summary: summary({ complaints: ['acne'] }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Consultation'), id('Chemical peel'), id('Acne peel package')],
  },
  {
    name: 'acne, one peel done',
    summary: summary({
      complaints: ['acne'],
      diagnoses: ['Acne vulgaris'],
      treatments: [{ name: 'Chemical peel', month: '2026-08' }],
      completed_visits: 2,
    }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Acne peel package'), id('Chemical peel'), id('Hydrafacial')],
  },
  {
    name: 'acne package almost used',
    summary: summary({
      complaints: ['acne'],
      packages: [{ offering: 'Acne peel package', sessions_left: 1 }],
      completed_visits: 4,
    }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Acne peel package'), id('Microneedling'), id('Hydrafacial')],
  },
  {
    name: 'acne scars',
    summary: summary({
      complaints: ['acne scars'],
      diagnoses: ['Post-acne scarring'],
      completed_visits: 1,
    }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Microneedling'), id('Chemical peel')],
  },
  {
    name: 'hair fall, first visit',
    summary: summary({ complaints: ['hair fall'] }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Consultation'), id('PRP for hair'), id('GFC for hair')],
  },
  {
    name: 'hair fall, PRP done twice',
    summary: summary({
      complaints: ['hair fall'],
      diagnoses: ['Androgenetic alopecia'],
      treatments: [
        { name: 'PRP for hair', month: '2026-07' },
        { name: 'PRP for hair', month: '2026-08' },
      ],
      completed_visits: 3,
    }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('PRP hair package'), id('GFC for hair')],
  },
  {
    name: 'hair fall, package planned',
    summary: summary({
      complaints: ['hair fall'],
      completed_visits: 2,
      already_planned: ['PRP hair package'],
    }),
    plannedPublicIds: [id('PRP hair package')],
    acceptedPublicIds: [id('GFC for hair'), id('PRP for hair')],
  },
  {
    name: 'pigmentation',
    summary: summary({ complaints: ['pigmentation'], diagnoses: ['Melasma'], completed_visits: 1 }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Q-switch laser for pigmentation'), id('Chemical peel')],
  },
  {
    name: 'pigmentation, laser planned',
    summary: summary({
      complaints: ['pigmentation'],
      completed_visits: 2,
      already_planned: ['Q-switch laser for pigmentation'],
    }),
    plannedPublicIds: [id('Q-switch laser for pigmentation')],
    acceptedPublicIds: [id('Chemical peel'), id('Hydrafacial')],
  },
  {
    name: 'unwanted facial hair',
    summary: summary({ complaints: ['unwanted hair'] }),
    plannedPublicIds: [],
    acceptedPublicIds: [
      id('Laser hair reduction — full face'),
      id('Laser hair reduction package — full face'),
    ],
  },
  {
    name: 'laser hair package almost used',
    summary: summary({
      complaints: ['unwanted hair'],
      packages: [{ offering: 'Laser hair reduction package — full face', sessions_left: 1 }],
      completed_visits: 6,
    }),
    plannedPublicIds: [],
    acceptedPublicIds: [
      id('Laser hair reduction package — full face'),
      id('Laser hair reduction — full face'),
    ],
  },
  {
    name: 'fine lines',
    summary: summary({ complaints: ['wrinkles'], completed_visits: 1 }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Botox — forehead'), id('Microneedling')],
  },
  {
    name: 'dark circles',
    summary: summary({ complaints: ['dark circles'], completed_visits: 1 }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Dermal filler — under eye'), id('Chemical peel')],
  },
  {
    name: 'dull skin before an event',
    summary: summary({ complaints: ['dull skin'] }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Hydrafacial'), id('Chemical peel')],
  },
  {
    name: 'mole',
    summary: summary({ complaints: ['mole'], diagnoses: ['Benign naevus'], completed_visits: 1 }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Mole removal')],
  },
  {
    name: 'skin tags',
    summary: summary({ complaints: ['skin tags'], completed_visits: 1 }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Skin tag removal')],
  },
  {
    name: 'a regular, everything done recently',
    summary: summary({
      complaints: ['dull skin'],
      treatments: [
        { name: 'Hydrafacial', month: '2026-09' },
        { name: 'Chemical peel', month: '2026-08' },
      ],
      completed_visits: 8,
    }),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Microneedling'), id('Hydrafacial'), id('Chemical peel')],
  },
  {
    name: 'acne and hair fall together',
    summary: summary({ complaints: ['acne', 'hair fall'], completed_visits: 1 }),
    plannedPublicIds: [],
    acceptedPublicIds: [
      id('Chemical peel'),
      id('Acne peel package'),
      id('PRP for hair'),
      id('GFC for hair'),
    ],
  },
  {
    name: 'nothing on record yet',
    summary: summary({}),
    plannedPublicIds: [],
    acceptedPublicIds: [id('Consultation')],
  },
  {
    name: 'everything relevant already planned',
    summary: summary({
      complaints: ['hair fall'],
      completed_visits: 3,
      already_planned: ['PRP hair package', 'GFC for hair', 'PRP for hair'],
    }),
    plannedPublicIds: [id('PRP hair package'), id('GFC for hair'), id('PRP for hair')],
    acceptedPublicIds: [id('Consultation')],
  },
];
