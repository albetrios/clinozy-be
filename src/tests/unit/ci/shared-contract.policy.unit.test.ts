import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UNIT_RELEVANT } from '@tooling/validate/pre-push-steps.js';
import { PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';

/** This repository's side of the contract: its agent-os prefix, its name, the other's, its mirror test. */
const SIDE = {
  prefix: 'be-',
  repository: PROJECT_SLUG,
  otherRepository: 'clinozy-fe',
  mirrorTest: 'src/tests/unit/ci/mirrored-files.policy.unit.test.ts',
} as const;

/** The shared rules, as data (agent-os/shared-contract.json, a true copy in clinozy-fe). */
interface SharedContract {
  sharedHooks: Record<string, Record<string, unknown>>;
  prePushRelevant: { runs: string[]; skips: string[] };
  sameTaskSection: string;
}

const contract = JSON.parse(
  readFileSync('agent-os/shared-contract.json', 'utf8'),
) as SharedContract;

/** A contract value on this repository's side: `<this-repository>` becomes its name, `<prefix>-` becomes `be-`. */
const onThisSide = <Value>(value: Value): Value =>
  JSON.parse(
    JSON.stringify(value)
      .replaceAll('<prefix>-', SIDE.prefix)
      .replaceAll('<this-repository>', SIDE.repository),
  ) as Value;

/** CLAUDE.md's same-pattern section with the repository names and the mirror-test path folded. */
function sameTaskSection(): string {
  const text = readFileSync('CLAUDE.md', 'utf8');
  const start = text.indexOf('## Same task, same pattern in both repositories');
  const end = text.indexOf('\n## ', start + 1);
  return text
    .slice(start, end)
    .trim()
    .replaceAll(SIDE.repository, '<this-repository>')
    .replaceAll(SIDE.otherRepository, '<other-repository>')
    .replaceAll(SIDE.mirrorTest, '<mirror-test>');
}

/**
 * Locks in the rules this repository shares with clinozy-fe, from the one contract both keep
 * (CLAUDE.md → Same task, same pattern in both repositories). A CI run checks out one repository,
 * so each checks its own code against the contract; the mirror test keeps the two copies equal in
 * a session that holds both. Changing a shared rule means changing the contract, in both.
 */
describe('agent-os/shared-contract.json (the rules both repositories share)', () => {
  it('registers every shared hook exactly as the contract says', () => {
    const manifest = JSON.parse(readFileSync('agent-os/hooks/hooks.json', 'utf8')) as {
      hooks: Array<Record<string, unknown> & { id: string }>;
    };
    for (const [name, registration] of Object.entries(contract.sharedHooks)) {
      const entry = manifest.hooks.find((hook) => hook.id === `${SIDE.prefix}${name}`);
      expect(entry, name).toBeDefined();
      const wiring = { ...entry };
      delete wiring.id;
      delete wiring.script;
      expect(wiring, name).toEqual(onThisSide(registration));
    }
  });

  it('runs the selected tests at push for the same paths', () => {
    for (const file of onThisSide(contract.prePushRelevant.runs))
      expect(UNIT_RELEVANT.test(file), file).toBe(true);
    for (const file of onThisSide(contract.prePushRelevant.skips))
      expect(UNIT_RELEVANT.test(file), file).toBe(false);
  });

  it('states the same-pattern rule in CLAUDE.md word for word', () => {
    expect(sameTaskSection()).toBe(contract.sameTaskSection);
  });
});
