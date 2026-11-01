import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Policy: a repository read of a user-identity-policy table names its organization.
 *
 * Four tables carry a policy that is OR'ed into EVERY request, not only the requests of their own
 * user:
 * - `tenancy.memberships` — `memberships_user_self_discovery` (the caller's own memberships);
 * - `tenancy.organizations` — `organizations_user_discovery` (the organizations the caller belongs to);
 * - `audit.logs` — `audit_logs_user_export_select` (the caller's own activity, for an export);
 * - `notify.notifications` — `notifications_owner_select` (the caller's own notifications).
 *
 * A clinic request runs with the organization GUC AND the user GUC set. Postgres ORs the tenant
 * arm with the user arm, so a read of one of these tables without an organization filter returns
 * the caller's rows from EVERY organization they belong to, not only the active one (B2-10). RLS
 * cannot be narrowed here without breaking the user-discovery features, so the filter is written
 * in the repository: this test pins it.
 *
 * The check is a ratchet over every `*.repository.ts` under `src/domains`. A method that reads one
 * of the tables through `select` (a `from` or a join) must mention its organization key —
 * `organization_id` (or `organizations.id` / `organizations.public_id` for the organizations table)
 * — somewhere in its body. A method that cannot (a user-keyed read by design, a slug or Stripe
 * lookup whose answer IS the organization, a platform-admin search) is listed in
 * {@link ORGANIZATION_FILTER_EXCEPTIONS} with its reason. The list must match the code exactly:
 * a new unfiltered read fails, and so does an exception whose method no longer reads the table.
 *
 * The scan works on method bodies, not on the Drizzle chain, so it cannot see a filter kept in a
 * different method. Reviewers still own that; this test keeps the common drop from shipping.
 */

const PROJECT_ROOT = process.cwd();
const DOMAINS_ROOT = join(PROJECT_ROOT, 'src', 'domains');

type TrackedTable = {
  /** Schema file the table is imported from (module basename). */
  module: string;
  /** Export name in that schema file, as repositories import it. */
  identifier: string;
  /** `schema.table`, as the exceptions list names it. */
  key: string;
  /** The organization key a filter must mention for this table. */
  organizationKey: RegExp;
};

const TRACKED_TABLES: readonly TrackedTable[] = [
  {
    module: 'membership.schema',
    identifier: 'memberships',
    key: 'tenancy.memberships',
    organizationKey: /\borganization_id\b/,
  },
  {
    module: 'organization.schema',
    identifier: 'organizations',
    key: 'tenancy.organizations',
    organizationKey: /\b(?:organization_id|organizations\.id|organizations\.public_id)\b/,
  },
  {
    module: 'notification.schema',
    identifier: 'notifications',
    key: 'notify.notifications',
    organizationKey: /\borganization_id\b/,
  },
  {
    module: 'audit.schema',
    identifier: 'logs',
    key: 'audit.logs',
    organizationKey: /\borganization_id\b/,
  },
];

/**
 * Reads of a user-identity-policy table that carry no organization filter, by design. Keyed
 * `<repository file>#<method>#<schema.table>`. Each reason says what makes the read safe without
 * one; a read that needs a filter gets one in its repository instead of an entry here.
 */
const ORGANIZATION_FILTER_EXCEPTIONS: Readonly<Record<string, string>> = {
  'src/domains/app/sub-domains/billing/day-closes/day-closes.repository.ts#findEvents#tenancy.memberships':
    'left join resolves the author name by the event membership FK; the events are reached only by day-close ids the organization already scoped',
  'src/domains/app/sub-domains/billing/payments/payments.repository.ts#listEdits#tenancy.memberships':
    'left join resolves the editor name by the edit membership FK; the edits are reached only by a payment id the organization already scoped',
  'src/domains/app/sub-domains/billing/payments/payments.repository.ts#findEditSummaries#tenancy.memberships':
    'left join resolves the editor name by the edit membership FK; the edits are reached only by payment ids the organization already scoped',
  'src/domains/app/sub-domains/branches/branch-members/branch-members.repository.ts#listForBranch#tenancy.memberships':
    'inner join names the member of a branch row; the branch rows are reached only by the branch id the organization already scoped',
  'src/domains/app/sub-domains/branches/branch-members/branch-members.repository.ts#listLiveMembershipIds#tenancy.memberships':
    'inner join names the member of a branch row; the branch rows are reached only by the branch id the organization already scoped',
  'src/domains/app/sub-domains/contacts/contact-members/contact-members.repository.ts#listForContact#tenancy.memberships':
    'inner join names the member of a contact row; the contact rows are reached only by the contact id the organization already scoped',
  'src/domains/app/sub-domains/medical/medical-sales/medical-sales.repository.ts#findMemberIds#tenancy.memberships':
    'inner join names the member of an invoice row; the invoice rows are reached only by invoice ids the organization already scoped',
  'src/domains/app/sub-domains/medical/medical-sales/medical-sales.repository.ts#findReturns#tenancy.memberships':
    'left join resolves the returning member by its FK; the returns are reached only by sale ids the organization already scoped',
  'src/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.repository.ts#listForParents#tenancy.memberships':
    'left join resolves the author name by the action membership FK; the actions are reached only by parent ids the organization already scoped',
  'src/domains/app/sub-domains/tasks/tasks.repository.ts#findRoleKeyOfMembership#tenancy.memberships':
    'reads the role key of a membership named by its id, a membership the task already belongs to in the caller organization',
  'src/domains/audit/audit.repository.ts#findWithFilters#audit.logs':
    'platform-admin audit search (listForAdmin, GLOBAL_ADMIN context); the organization filter is optional by design, the super admin reads every clinic',
  'src/domains/audit/audit.repository.ts#findRecent#audit.logs':
    'no caller under src/domains today; a platform-wide recent-rows read. Add an organization filter before it is wired to a clinic request',
  'src/domains/audit/audit.repository.ts#listActivityForUserDataExport#audit.logs':
    'the caller own activity across organizations for the GDPR export (audit_logs_user_export_select); keyed by actor, not by organization, by design',
  'src/domains/notify/sub-domains/notification/notification.repository.ts#findByUser#notify.notifications':
    'the caller own notifications (notifications_owner_select); keyed by user, by design',
  'src/domains/notify/sub-domains/notification/notification.repository.ts#listForUserDataExport#notify.notifications':
    'the caller own notifications for the GDPR export (notifications_owner_select); keyed by user, by design',
  'src/domains/notify/sub-domains/notification/notification.repository.ts#findByPublicIdForUser#notify.notifications':
    'the caller own notification, by its public id and user id (notifications_owner_select)',
  'src/domains/notify/sub-domains/notification/notification.repository.ts#markAllReadForUser#notify.notifications':
    'marks the caller own notifications read (notifications_owner_select); keyed by user, by design',
  'src/domains/notify/sub-domains/notification/notification.repository.ts#countUnreadForUser#notify.notifications':
    'counts the caller own unread notifications (notifications_owner_select); keyed by user, by design',
  'src/domains/tenancy/sub-domains/organization/organization.repository.ts#findBySlug#tenancy.organizations':
    'the lookup answers which organization owns a slug; there is no organization to filter by before it is found',
  'src/domains/tenancy/sub-domains/organization/organization.repository.ts#countActiveOwnedByUser#tenancy.organizations':
    'counts the caller owned team organizations across the platform (owner_user_id, organizations_user_discovery); keyed by owner, by design',
  'src/domains/tenancy/sub-domains/organization/organization.repository.ts#findByStripeCustomerId#tenancy.organizations':
    'resolves the organization that owns a Stripe customer; the answer is the organization, found before any organization context exists',
};

/** A class member or top-level function header that starts a method body. */
const METHOD_HEADER =
  /^(?: {2})?(?:export\s+)?(?:async\s+|private\s+|public\s+|static\s+|override\s+)*(?:function\s+)?([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/;

/** Method name and body line ranges, found by header indentation (repositories are classes). */
function splitMethods(lines: readonly string[]): { name: string; body: string }[] {
  const headers: { index: number; name: string }[] = [];
  lines.forEach((line, index) => {
    const match = METHOD_HEADER.exec(line);
    if (match === null) return;
    const name = match[1] ?? '';
    if (/^(?:if|for|while|switch|return|await|catch)$/.test(name)) return;
    const isMember = line.startsWith('  ') && !line.startsWith('   ');
    const isFunction = /^(?:export\s+)?(?:async\s+)?function\s/.test(line);
    if (isMember || isFunction) headers.push({ index, name });
  });
  return headers.map((header, position) => {
    const end = headers[position + 1]?.index ?? lines.length;
    return { name: header.name, body: lines.slice(header.index, end).join('\n') };
  });
}

/**
 * Keys `<file>#<method>#<schema.table>` for every method that reads a tracked table through
 * `select` and never mentions the table's organization key.
 */
function findUnfilteredTableReads(options: {
  file: string;
  source: string;
  tables?: readonly TrackedTable[];
}): string[] {
  const tables = options.tables ?? TRACKED_TABLES;
  const keys: string[] = [];
  const importedTables = tables.filter((table) =>
    new RegExp(
      `import\\s*(?:type\\s*)?\\{[^}]*\\b${table.identifier}\\b[^}]*\\}\\s*from\\s*'[^']*${table.module}\\.js'`,
    ).test(options.source),
  );
  if (importedTables.length === 0) return keys;

  for (const method of splitMethods(options.source.split('\n'))) {
    if (!/\bselect(?:Distinct)?\s*\(/.test(method.body)) continue;
    for (const table of importedTables) {
      const readsTable = new RegExp(
        `\\.(?:from|innerJoin|leftJoin|rightJoin|fullJoin|join)\\(\\s*${table.identifier}\\s*[,)]`,
      ).test(method.body);
      if (!readsTable || table.organizationKey.test(method.body)) continue;
      keys.push(`${options.file}#${method.name}#${table.key}`);
    }
  }
  return [...new Set(keys)];
}

async function* walkRepositories(root: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walkRepositories(entryPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.repository.ts')) yield entryPath;
  }
}

describe('Global: user-identity policy tables are read with an organization filter', () => {
  it('detects an unfiltered select and accepts one that names the organization', () => {
    const unfiltered = [
      "import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';",
      'class Repo {',
      '  async listForUser(user_id: number) {',
      '    return getRequestDatabase().select().from(memberships).where(eq(memberships.user_id, user_id));',
      '  }',
      '}',
    ].join('\n');
    expect(findUnfilteredTableReads({ file: 'sample.ts', source: unfiltered })).toEqual([
      'sample.ts#listForUser#tenancy.memberships',
    ]);

    const filtered = unfiltered.replace(
      'where(eq(memberships.user_id, user_id))',
      'where(and(eq(memberships.organization_id, organization_id), eq(memberships.user_id, user_id)))',
    );
    expect(findUnfilteredTableReads({ file: 'sample.ts', source: filtered })).toEqual([]);

    // A same-named local identifier that is not the schema table is not a table read.
    const local = unfiltered.replace(
      "import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';",
      '',
    );
    expect(findUnfilteredTableReads({ file: 'sample.ts', source: local })).toEqual([]);
  });

  it('every select on a user-identity policy table names its organization or is a listed exception', async () => {
    const repositoryFiles: string[] = [];
    for await (const filePath of walkRepositories(DOMAINS_ROOT)) repositoryFiles.push(filePath);
    // Guard against a vacuous pass: the scan must reach the repositories that read these tables.
    expect(repositoryFiles.length).toBeGreaterThan(50);

    const found: string[] = [];
    for (const filePath of repositoryFiles) {
      const source = await fs.readFile(filePath, 'utf8');
      found.push(
        ...findUnfilteredTableReads({
          file: relative(PROJECT_ROOT, filePath),
          source,
        }),
      );
    }

    const unlisted = found.filter((key) => !(key in ORGANIZATION_FILTER_EXCEPTIONS)).sort();
    expect(
      unlisted,
      'Add `eq(<table>.organization_id, <organization id>)` to the query (the tenant arm and the user arm are OR-ed, so a read without it returns other clinics). Only a read that is safe by design goes in ORGANIZATION_FILTER_EXCEPTIONS, with its reason.',
    ).toEqual([]);

    const stale = Object.keys(ORGANIZATION_FILTER_EXCEPTIONS)
      .filter((key) => !found.includes(key))
      .sort();
    expect(
      stale,
      'Exceptions whose method no longer reads the table without an organization filter — remove them.',
    ).toEqual([]);
  });
});
