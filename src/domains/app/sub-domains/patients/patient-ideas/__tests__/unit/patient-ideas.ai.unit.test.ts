import { describe, expect, it } from 'vitest';
import {
  PATIENT_IDEA_REASON_MAX,
  PATIENT_IDEA_SOURCE,
  PATIENT_IDEAS_MAX,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.constants.js';
import {
  buildIdeasPrompt,
  concernLabels,
  parseIdeasAnswer,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.ai.js';
import type {
  IdeaOffering,
  PatientIdeasSummary,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.types.js';

/** An active offering of the menu. */
function offering(id: number, name: string): IdeaOffering {
  return {
    id,
    publicId: `ofr_${String(id).padStart(21, 'a')}`,
    name,
    category: 'Skin',
    sessions: 1,
    price: '2500.50',
  };
}

const MENU = [1, 2, 3, 4, 5, 6].map((id) => offering(id, `Offering ${id}`));

const SUMMARY: PatientIdeasSummary = {
  complaints: ['Hair fall'],
  diagnoses: ['Telogen effluvium'],
  treatments: [{ name: 'PRP session', month: '2026-08' }],
  packages: [{ offering: 'PRP package', sessions_left: 1 }],
  completed_visits: 3,
  already_planned: ['Offering 6'],
};

/** An answer naming the given offerings, as Claude would give it. */
function answer(ideas: { offering_id: string; reason: string }[]): string {
  return JSON.stringify({ ideas });
}

/** The prompt and the reading of Claude's answer (D80, PI6). */
describe('patient ideas AI', () => {
  it('sends the de-identified summary and the menu by public id, price in rupees', () => {
    const { system, prompt } = buildIdeasPrompt({ summary: SUMMARY, offerings: MENU.slice(0, 1) });

    expect(system).toContain('Answer with JSON only');
    expect(JSON.parse(prompt)).toEqual({
      patient: SUMMARY,
      offerings: [
        {
          id: MENU[0]?.publicId,
          name: 'Offering 1',
          category: 'Skin',
          sessions: 1,
          price_rupees: 2500.5,
        },
      ],
    });
  });

  it('reads the ideas in order, from a code fence too', () => {
    const text = `Here you go:\n\`\`\`json\n${answer([
      { offering_id: MENU[1]?.publicId ?? '', reason: ' Keeps the scalp on track ' },
      { offering_id: MENU[0]?.publicId ?? '', reason: 'A follow-up consultation' },
    ])}\n\`\`\``;

    expect(parseIdeasAnswer({ text, offerings: MENU, excluded: new Set() })).toEqual([
      { offering: MENU[1], reason: 'Keeps the scalp on track', source: PATIENT_IDEA_SOURCE.AI },
      { offering: MENU[0], reason: 'A follow-up consultation', source: PATIENT_IDEA_SOURCE.AI },
    ]);
  });

  it('drops ids off the menu, planned offerings, repeats and empty reasons', () => {
    const text = answer([
      { offering_id: 'ofr_notonthemenuaaaaaaaa', reason: 'Invented' },
      { offering_id: MENU[5]?.publicId ?? '', reason: 'Already planned' },
      { offering_id: MENU[2]?.publicId ?? '', reason: 'First' },
      { offering_id: MENU[2]?.publicId ?? '', reason: 'Again' },
      { offering_id: MENU[3]?.publicId ?? '', reason: '   ' },
    ]);

    const ideas = parseIdeasAnswer({ text, offerings: MENU, excluded: new Set([6]) });

    expect(ideas?.map((idea) => [idea.offering.id, idea.reason])).toEqual([[3, 'First']]);
  });

  it(`keeps at most ${PATIENT_IDEAS_MAX} ideas and trims a long reason`, () => {
    const text = answer(
      MENU.map((item) => ({ offering_id: item.publicId, reason: 'x'.repeat(300) })),
    );

    const ideas = parseIdeasAnswer({ text, offerings: MENU, excluded: new Set() });

    expect(ideas).toHaveLength(PATIENT_IDEAS_MAX);
    expect(ideas?.[0]?.reason).toHaveLength(PATIENT_IDEA_REASON_MAX);
  });

  it('reads "nothing fits" as no ideas', () => {
    expect(
      parseIdeasAnswer({ text: '{"ideas":[]}', offerings: MENU, excluded: new Set() }),
    ).toEqual([]);
  });

  it.each([
    ['prose', 'I suggest a peel.'],
    ['broken JSON', '{"ideas": [ {"offering_id": '],
    ['the wrong shape', '{"suggestions":[]}'],
    ['a missing reason', '{"ideas":[{"offering_id":"ofr_x"}]}'],
  ])('answers null for %s', (_label, text) => {
    expect(parseIdeasAnswer({ text, offerings: MENU, excluded: new Set() })).toBeNull();
  });
});

/** The only way a complaint or an unlinked diagnosis reaches Claude (PI6). */
describe('concernLabels', () => {
  it('reduces free text to the fixed vocabulary, each concern once, in its order', () => {
    expect(
      concernLabels([
        'Asha (9876543210) says hair loss since her wedding',
        'Breakouts and old acne scars; uneven tan',
        'More pimples',
      ]),
    ).toEqual(['pigmentation', 'acne scars', 'acne', 'hair fall']);
  });

  it('adds nothing for a note that names no concern', () => {
    expect(concernLabels(['Called her husband Ravi about the bill'])).toEqual([]);
  });
});
