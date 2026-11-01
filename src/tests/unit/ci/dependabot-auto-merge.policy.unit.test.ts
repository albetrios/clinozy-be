import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobBlocks } from '@/tests/helpers/workflow-jobs.helper.js';

const ROOT = process.cwd();
const WORKFLOWS = join(ROOT, '.github/workflows');
const read = (file: string) => readFileSync(join(WORKFLOWS, file), 'utf8');

const autoMerge = read('dependabot-auto-merge.yml');
const approval = read('dependabot-approval.yml');

// The approval IS the manual gate: only the low-risk npm-non-major group may auto-merge, and only
// after a maintainer approves. Everything else is manual.
//
// H-3 / H-4: the approval runs dependabot-approval.yml, which holds nothing (a PR can rewrite it);
// dependabot-auto-merge.yml runs main's copy (workflow_run), checks every condition again from the
// API — an approval of the head by an OWNER / MEMBER / COLLABORATOR among them — and only then
// reads the PAT from the main-only development environment. clinozy-fe pins its own in
// tests/ci/dependabot-flows.policy.test.ts.
describe('dependabot auto-merge policy', () => {
  it('a submitted approval signals, from a job that holds nothing', () => {
    expect(approval).toContain('pull_request_review:');
    expect(approval).toContain('types: [submitted]');
    expect(approval).toContain("github.event.review.state == 'approved'");
    expect(approval).not.toMatch(/\$\{\{\s*secrets\./);
    expect(approval).not.toMatch(/^ +environment:/m);
    expect(approval).toMatch(/^ {4}permissions: \{\}$/m);
    expect(approval).toMatch(/^permissions:\n {2}contents: read\n\n/m);
  });

  it('arms from main only, on the approval signal, never on a pull_request trigger', () => {
    expect(autoMerge).toContain("workflows: ['Dependabot approval']");
    expect(autoMerge).toContain('types: [completed]');
    expect(autoMerge).not.toMatch(/^ {2}pull_request(?:_review|_target)?:/m);
    expect(autoMerge).not.toContain('actions/checkout');
    expect(autoMerge).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    );
  });

  it('matches only Dependabot-authored PRs in the npm-non-major group', () => {
    expect(approval).toContain("github.event.pull_request.user.login == 'dependabot[bot]'");
    expect(approval).toContain("'npm-non-major'");
    // …and checks both again from the API, on the open PR whose head is the approved commit.
    expect(autoMerge).toContain(
      '.author.login == "app/dependabot" or .author.login == "dependabot[bot]"',
    );
    expect(autoMerge).toContain('contains("npm-non-major")');
    expect(autoMerge).toContain('select(.headRefOid == $sha and (.isCrossRepository | not))');
    expect(autoMerge).not.toContain("'npm-major'");
  });

  it('counts only an approval of the head by an owner, member or collaborator (H-3)', () => {
    expect(approval).toContain(
      `contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.review.author_association)`,
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell expansion, asserted verbatim
    expect(autoMerge).toContain('repos/${REPOSITORY}/pulls/${number}/reviews');
    expect(autoMerge).toContain(
      'select(.commit_id == $sha and (.author_association | IN("OWNER", "MEMBER", "COLLABORATOR"))',
    );
    // A reviewer's later "changes requested" withdraws that reviewer's approval.
    expect(autoMerge).toContain('group_by(.user.login) | map(max_by(.submitted_at))');
    expect(autoMerge).toContain('--match-head-commit "$HEAD_SHA"');
  });

  it('the review check reads a trusted approval of the head, and nothing else, as approved', () => {
    const program =
      /approvals="\$\(jq -s --arg sha "\$HEAD_SHA" '([\s\S]*?)' reviews\.jsonl\)"/.exec(
        autoMerge,
      )?.[1];
    expect(program).toBeDefined();
    const review = (options: {
      login: string;
      state: string;
      association: string;
      commit: string;
      at: string;
    }) =>
      JSON.stringify({
        user: { login: options.login },
        state: options.state,
        author_association: options.association,
        commit_id: options.commit,
        submitted_at: options.at,
      });
    const count = (reviews: string[]) => {
      const result = spawnSync('jq', ['-s', '--arg', 'sha', 'head', program ?? ''], {
        input: reviews.join('\n'),
        encoding: 'utf8',
      });
      return Number(result.stdout.trim());
    };
    const owner = { login: 'owner', association: 'OWNER', commit: 'head', at: '1' };
    expect(count([review({ ...owner, state: 'APPROVED' })])).toBe(1);
    expect(
      count([
        review({
          login: 'stranger',
          state: 'APPROVED',
          association: 'NONE',
          commit: 'head',
          at: '1',
        }),
      ]),
    ).toBe(0);
    expect(
      count([
        review({
          login: 'contributor',
          state: 'APPROVED',
          association: 'CONTRIBUTOR',
          commit: 'head',
          at: '1',
        }),
      ]),
    ).toBe(0);
    expect(
      count([
        review({
          login: 'member',
          state: 'APPROVED',
          association: 'MEMBER',
          commit: 'older',
          at: '1',
        }),
      ]),
    ).toBe(0);
    expect(
      count([
        review({ ...owner, state: 'APPROVED' }),
        review({ ...owner, state: 'CHANGES_REQUESTED', at: '2' }),
      ]),
    ).toBe(0);
  });

  it('uses squash auto-merge with no third-party actions', () => {
    expect(autoMerge).toContain('gh pr merge --auto --squash');
    expect(autoMerge).not.toContain('uses:');
    expect(approval).not.toContain('uses:');
    // The merge needs both writes when GITHUB_TOKEN is the fallback (see the job's permissions).
    expect(autoMerge).toMatch(/^ {6}contents: write$/m);
    expect(autoMerge).toMatch(/^ {6}pull-requests: write$/m);
  });

  it('merges with the PAT (github.token fallback) so the merge push triggers post-merge CI', () => {
    // A GITHUB_TOKEN-attributed merge starts no workflows (no post-merge run for that commit). The
    // PAT is an ENVIRONMENT secret, so the job selects `development` to read it — main only, which
    // a workflow_run job runs on. Never `production`, whose reviewers would gate every merge.
    expect(autoMerge).toMatch(
      /GH_TOKEN:\s*\$\{\{\s*secrets\.RELEASE_PLEASE_TOKEN \|\| secrets\.GITHUB_TOKEN\s*\}\}/,
    );
    expect(autoMerge).toContain('environment: development');
    expect(autoMerge).not.toContain('environment: production');
    // The PAT reaches the one step that merges, after every check.
    expect(autoMerge.match(/secrets\.RELEASE_PLEASE_TOKEN/g)).toHaveLength(1);
    expect(autoMerge.indexOf('secrets.RELEASE_PLEASE_TOKEN')).toBeGreaterThan(
      autoMerge.indexOf('- name: Enable squash auto-merge'),
    );
  });
});

/** `text` without its comment lines. */
const withoutComments = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

/** The workflow's `on:` block, comments dropped. */
function triggers(workflow: string): string {
  const code = withoutComments(workflow);
  const start = code.search(/^on:/m);
  if (start === -1) return '';
  const rest = code.slice(start).split('\n');
  const end = rest.slice(1).findIndex((line) => /^\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end + 1).join('\n');
}

/** True when a pull request (or a review of one) starts the workflow. */
const pullRequestTriggered = (workflow: string) =>
  /^ {2}pull_request(?:_review|_review_comment|_target)?:/m.test(triggers(workflow));

const workflowFiles = readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file));
const developmentEnvironment = JSON.parse(
  readFileSync(join(ROOT, '.github/environments/development.json'), 'utf8'),
) as {
  protection?: {
    deploymentBranchPolicy?: { protectedBranches?: boolean; customBranchPolicies?: boolean };
  };
};

/**
 * H-4: the development environment holds the release PAT (and the development deploy's secrets),
 * so it allows the main branch only, and no job a pull request starts selects it. A job that must
 * react to a pull request and needs one of those secrets is split: the pull-request half holds
 * nothing, a workflow_run half (main's copy of its file, run on main) reads the secret.
 */
describe('the development environment allows the main branch only (H-4)', () => {
  it('reads the triggers (parser sanity)', () => {
    expect(pullRequestTriggered(approval)).toBe(true);
    expect(pullRequestTriggered(autoMerge)).toBe(false);
  });

  it('declares the protected-branches deployment policy', () => {
    expect(developmentEnvironment.protection?.deploymentBranchPolicy).toEqual({
      protectedBranches: true,
      customBranchPolicies: false,
    });
  });

  it('no workflow runs on pull_request_target', () => {
    for (const file of workflowFiles) {
      expect(triggers(read(file)), file).not.toMatch(/pull_request_target/);
    }
  });

  it('no job a pull request starts selects an environment', () => {
    const offences = workflowFiles
      .filter((file) => pullRequestTriggered(read(file)))
      .flatMap((file) =>
        jobBlocks(withoutComments(read(file)))
          .filter(([, block]) => /^ {4}environment:/m.test(block))
          .map(([name]) => `${file} job '${name}'`),
      );
    expect(offences).toEqual([]);
  });
});
