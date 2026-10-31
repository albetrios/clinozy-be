// The one copy of clinozy-be's guard rules, shared by the Claude hooks (be-guard-edits.mjs,
// be-guardrails.mjs) and their Cursor mirrors (be-cursor-edit-guard.mjs,
// be-cursor-shell-guard.mjs, be-cursor-read-guard.mjs), so the two platforms can never enforce
// different rules or name a helper that no longer exists.

/**
 * A real secrets file the agent must not read or write: app `.env.<env>`, setup-tooling
 * credentials `.setup-credentials` (or legacy `.env.setup`), and `.setup-state.*` — but NOT the
 * committed templates (`.env.example`, `.env.setup.example`).
 */
export function isReadableSecretPath(path) {
  if (!path) return false;
  if (/(^|\/)\.setup-credentials$/.test(path)) return true;
  if (/(^|\/)\.setup-state\.(json|lock|audit\.log)$/.test(path)) return true;
  if (/(^|\/)\.env\.example$/.test(path) || /(^|\/)\.env\.setup\.example$/.test(path)) return false;
  return /(^|\/)\.env(\.[\w.-]+)?$/.test(path);
}

/**
 * Why `command` must not run, or `''`: a recursive force delete, a force push, a fork bomb, a
 * filesystem-destroying command, or a skip of the git hooks.
 *
 * Quoted strings and heredoc bodies are removed first, so a pattern that merely appears in a
 * message (a commit message, an echo) never blocks.
 */
export function destructiveShellReason(command) {
  const scan = withoutQuotedText(command);
  if (/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i.test(scan)) {
    return "recursive force delete (rm -rf)";
  }
  if (/\bgit\s+push\b/i.test(scan) && (/--force(?!-with-lease)/i.test(scan) || /\s-f(?:\s|$)/.test(scan))) {
    return "git push --force (use --force-with-lease, or push it yourself)";
  }
  if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(scan)) return "fork bomb";
  if (/\bmkfs\b|\bdd\s+if=/i.test(scan)) return "filesystem-destroying command";
  if (
    /\bgit(?:\s+-[cC]\s+\S+)*\s+(?:commit|push)\b[^;&|]*--no-verify\b/i.test(scan) ||
    /\bgit(?:\s+-[cC]\s+\S+)*\s+commit\b[^;&|]*\s-[a-zA-Z]*n[a-zA-Z]*(?=\s|$)/.test(scan) ||
    /(?:^|[\s;&|])HUSKY=0\b/.test(scan)
  ) {
    return "skipping the git hooks (--no-verify, git commit -n, HUSKY=0) — the pre-commit and pre-push gates are mandatory; fix what they report";
  }
  return "";
}

/** `command` with heredoc bodies and quoted strings blanked out. */
export function withoutQuotedText(command) {
  return command
    .replace(/<<-?\s*['"]?[A-Za-z_]\w*['"]?[\s\S]*$/, " ")
    .replace(/'[^']*'/g, " ")
    .replace(/"[^"]*"/g, " ");
}

/** Generated files: change the source and run the generator instead (rule R3). */
const GENERATED_FILE =
  /(pnpm-lock\.yaml|docs\/routes\.txt|docs\/openapi\/openapi[^/]*\.json|docs\/postman-collection\.json|project-identity\.constants\.ts|docs\/database\/clinozy-be\.dbml|\.codex\/hooks\.json|agent-os\/platforms\/codex\/hooks\.json)$/;

/**
 * The hard rules an edit breaks, in the order they are checked: `{ rule, decision, reason }`,
 * every `decision` a `deny`.
 *
 * R1–R4 are clinozy-be's conventions, so they judge only files in this repository
 * (`inRepository`); a session holding several repositories runs every repository's hooks on every
 * edit (tooling/agent-os/session-hooks.ts).
 */
export function editRuleViolations({ filePath, content, inRepository }) {
  const violations = [];
  const base = filePath.split("/").pop();
  if (!inRepository) return violations;
  if (GENERATED_FILE.test(filePath)) {
    violations.push({
      rule: "R3",
      decision: "deny",
      reason: `'${base}' is generated — do not hand-edit it. Change the source and run the generator (see agent-os/docs/skill-triggers.md / CLAUDE.md).`,
    });
  }
  if (/\.(worker|processor)\.ts$/.test(filePath) && /getRequestDatabase/.test(content)) {
    violations.push({
      rule: "R1",
      decision: "deny",
      reason:
        "Workers/processors must not call getRequestDatabase() (RLS — it returns the GUC-less pool). Bind a handle via a context wrapper — withAppDatabaseContext / runOrganizationScopedWorkerJob (CLAUDE.md → Organization context / RLS; enforced by global tests).",
    });
  }
  if (/(^|\/)src\/.*\.tsx?$/.test(filePath) && /(from|require|import)\s*\(?\s*['"]\.\.\//.test(content)) {
    violations.push({
      rule: "R2",
      decision: "deny",
      reason:
        "Relative parent import ('../') is banned under src/ — use the '@/' alias (be-import-paths.mdc; enforced by import-paths.global.test.ts).",
    });
  }
  if (!/\.(md|mdc|txt)$/.test(filePath) && /NODE_ENV\s*[:=]+\s*['"`]?(test|staging)\b/i.test(content)) {
    violations.push({
      rule: "R4",
      decision: "deny",
      reason:
        "NODE_ENV must never be 'test' or 'staging' (the enum is 'local' | 'development' | 'production'; the Vitest suite runs as 'development'). Drive environment-varying behaviour via an explicit env flag with a static default + production .refine() (agent-os/skills/be-env-schema-add/SKILL.md; enforced by no-nodeenv-branching.global.test.ts).",
    });
  }
  return violations;
}
