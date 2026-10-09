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
function offering(
  index: number,
  name: string,
  category: string,
  price: string,
  sessions = 1,
): IdeaOffering {
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
  offering(1, 'Consultation', 'Consultation', '500.00'),
  offering(2, 'Chemical peel', 'Skin', '2500.00'),
  offering(3, 'Acne peel package', 'Skin', '9000.00', 4),
  offering(4, 'Hydrafacial', 'Skin', '4500.00'),
  offering(5, 'Microneedling', 'Skin', '6000.00'),
  offering(6, 'PRP for hair', 'Hair', '6000.00'),
  offering(7, 'PRP hair package', 'Hair', '20000.00', 4),
  offering(8, 'GFC for hair', 'Hair', '9000.00'),
  offering(9, 'Laser hair reduction — full face', 'Laser', '3500.00'),
  offering(10, 'Laser hair reduction package — full face', 'Laser', '18000.00', 6),
  offering(11, 'Q-switch laser for pigmentation', 'Laser', '5000.00'),
  offering(12, 'Botox — forehead', 'Injectables', '12000.00'),
  offering(13, 'Dermal filler — under eye', 'Injectables', '22000.00'),
  offering(14, 'Mole removal', 'Procedures', '3000.00'),
  offering(15, 'Skin tag removal', 'Procedures', '1500.00'),
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
