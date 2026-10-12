import { describe, expect, it } from 'vitest';
import { PATIENT_IDEA_SOURCE } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.constants.js';
import { ruleIdeas } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.rules.js';
import type {
  IdeaOffering,
  PatientIdeasHistory,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.types.js';

/** An active offering of the menu. */
function offering(id: number, name: string, sessions = 1): IdeaOffering {
  return {
    id,
    publicId: `ofr_${String(id).padStart(21, 'a')}`,
    name,
    category: 'Skin',
    sessions,
    price: '1000.00',
  };
}

const CONSULTATION = offering(1, 'Consultation');
const D_TAN = offering(2, 'D-Tan facial');
const PEEL = offering(3, 'Chemical peel');
const PRP = offering(4, 'PRP hair therapy');
const LHR_SINGLE = offering(5, 'LHR full face');
const LHR_PACKAGE = offering(6, 'LHR full face package', 6);
const HYDRA = offering(7, 'Hydra facial');
const MENU = [CONSULTATION, D_TAN, PEEL, PRP, LHR_SINGLE, LHR_PACKAGE, HYDRA];

/** A patient with no history — each case adds what it reads. */
function history(overrides: Partial<PatientIdeasHistory> = {}): PatientIdeasHistory {
  return {
    treatmentSuggestions: [],
    complaints: [],
    diagnoses: [],
    visitCount: 0,
    lastServiceName: null,
    packagesAlmostUsedOfferingIds: [],
    ...overrides,
  };
}

/** The prototype's rules (routes-final 7.N, PI1) — what the plan shows without AI ideas. */
describe('ruleIdeas', () => {
  it('starts a first visit with a consultation', () => {
    const ideas = ruleIdeas({ history: history(), offerings: MENU, excluded: new Set() });

    expect(ideas).toEqual([
      {
        offering: CONSULTATION,
        reason: 'First visit · start with a consultation',
        source: PATIENT_IDEA_SOURCE.FIRST,
      },
    ]);
  });

  it("follows the doctor's suggestion note first, quoting it", () => {
    const ideas = ruleIdeas({
      history: history({ treatmentSuggestions: ['Start PRP next month'], visitCount: 1 }),
      offerings: MENU,
      excluded: new Set(),
    });

    expect(ideas[0]).toEqual({
      offering: PRP,
      reason: "Doctor's note · “Start PRP next month”",
      source: PATIENT_IDEA_SOURCE.NOTE,
    });
  });

  it('answers complaints and diagnoses — pigmentation, hair fall, acne — once each', () => {
    const ideas = ruleIdeas({
      history: history({
        complaints: ['Uneven tan on cheeks'],
        diagnoses: ['Telogen effluvium with hair fall', 'Mild acne'],
        visitCount: 1,
      }),
      offerings: MENU,
      excluded: new Set(),
    });

    expect(ideas.map((idea) => [idea.offering.id, idea.reason, idea.source])).toEqual([
      [D_TAN.id, 'Complaint · Uneven tan on cheeks', PATIENT_IDEA_SOURCE.HISTORY],
      [PRP.id, 'Complaint · hair fall', PATIENT_IDEA_SOURCE.HISTORY],
      [PEEL.id, 'Complaint · acne', PATIENT_IDEA_SOURCE.HISTORY],
    ]);
  });

  it('names pigmentation when the word comes from a diagnosis, not a complaint', () => {
    const ideas = ruleIdeas({
      history: history({ diagnoses: ['Melasma'], visitCount: 1 }),
      offerings: MENU,
      excluded: new Set(),
    });

    expect(ideas[0]?.reason).toBe('Complaint · pigmentation');
  });

  it("suggests a package of the last service's family after two visits — never a single session", () => {
    const ideas = ruleIdeas({
      history: history({ visitCount: 3, lastServiceName: 'LHR full face' }),
      offerings: MENU,
      excluded: new Set(),
    });

    expect(ideas).toEqual([
      {
        offering: LHR_PACKAGE,
        reason: '3 visits so far · a package saves on each session',
        source: PATIENT_IDEA_SOURCE.CONSISTENCY,
      },
    ]);
  });

  it('renews a package almost used up', () => {
    const ideas = ruleIdeas({
      history: history({ visitCount: 1, packagesAlmostUsedOfferingIds: [LHR_PACKAGE.id] }),
      offerings: MENU,
      excluded: new Set(),
    });

    expect(ideas).toEqual([
      {
        offering: LHR_PACKAGE,
        reason: 'Package almost used up · renew',
        source: PATIENT_IDEA_SOURCE.RENEW,
      },
    ]);
  });

  it('never suggests an offering already in the plan, and takes the next match instead', () => {
    const ideas = ruleIdeas({
      history: history({ complaints: ['tan'], visitCount: 1 }),
      offerings: MENU,
      excluded: new Set([D_TAN.id]),
    });

    expect(ideas.map((idea) => idea.offering.id)).toEqual([PEEL.id]);
  });

  it('suggests an offering at most once and stops at four', () => {
    const ideas = ruleIdeas({
      history: history({
        treatmentSuggestions: ['Peel', 'LHR', 'Hydra', 'PRP'],
        complaints: ['acne and tan'],
        visitCount: 2,
        lastServiceName: 'LHR',
        packagesAlmostUsedOfferingIds: [LHR_PACKAGE.id],
      }),
      offerings: MENU,
      excluded: new Set(),
    });

    expect(ideas).toHaveLength(4);
    expect(new Set(ideas.map((idea) => idea.offering.id)).size).toBe(4);
  });

  it('answers nothing when the menu has no match', () => {
    expect(
      ruleIdeas({
        history: history({ complaints: ['tan'], visitCount: 1 }),
        offerings: [HYDRA],
        excluded: new Set(),
      }),
    ).toEqual([]);
  });
});
