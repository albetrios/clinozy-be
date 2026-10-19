# Agent catalog (clinozy-be)

<!-- GENERATED:START -->
All 13 project agents — each read-only. Generated from `agents/*.md` frontmatter
and `agents/pipelines.json`. See [platform-access.md](platform-access.md) for how to invoke on each platform.

| Agent | File | Wraps skill | Model (routing rationale) | Pipelines | Use when |
| ----- | ---- | ----------- | ------------------------- | --------- | -------- |
| **be-changelog-reviewer** | [`agent-os/agents/be-changelog-reviewer.md`](../agents/be-changelog-reviewer.md) | *(inline)* | `inherit` | — | Verify CHANGELOG.md vs git log / merged PR titles — gap report |
| **be-ci-investigator** | [`agent-os/agents/be-ci-investigator.md`](../agents/be-ci-investigator.md) | be-ci-investigation | `inherit` | — | One failing CI job — root-cause summary without log noise |
| **be-dependency-auditor** | [`agent-os/agents/be-dependency-auditor.md`](../agents/be-dependency-auditor.md) | be-dependency-security | `inherit` | prod-readiness | pnpm audit — vulnerabilities + prioritized fix plan |
| **be-docs-auditor** | [`agent-os/agents/be-docs-auditor.md`](../agents/be-docs-auditor.md) | be-docs-audit | `inherit` | — | Full docs/ audit — stale links, index gaps, Mermaid issues |
| **be-i18n-auditor** | [`agent-os/agents/be-i18n-auditor.md`](../agents/be-i18n-auditor.md) | be-i18n-message-guard | `inherit` | — | i18n audit — untranslated payload strings, locale key parity and drift |
| **be-idempotency-reviewer** | [`agent-os/agents/be-idempotency-reviewer.md`](../agents/be-idempotency-reviewer.md) | be-idempotency-guard | `inherit` | pre-merge-review | Pre-merge review of a diff that touches routes, controllers, billing or Stripe calls |
| **be-production-hardening-reviewer** | [`agent-os/agents/be-production-hardening-reviewer.md`](../agents/be-production-hardening-reviewer.md) | be-production-hardening-guard | `inherit` | pre-merge-review, prod-readiness | Targeted hardening sweep — security headers, DB/Redis/worker gaps |
| **be-production-reviewer** | [`agent-os/agents/be-production-reviewer.md`](../agents/be-production-reviewer.md) | be-path-to-production-gate + be-production-hardening-guard | `inherit` | prod-readiness | Pre-release / deploy sign-off — full readiness plan |
| **be-rls-reviewer** | [`agent-os/agents/be-rls-reviewer.md`](../agents/be-rls-reviewer.md) | be-rls-tenant-isolation-guard | `inherit` | pre-merge-review | Pre-merge review of a diff that touches tables, migrations, repositories, workers or database contexts |
| **be-sql-design-reviewer** | [`agent-os/agents/be-sql-design-reviewer.md`](../agents/be-sql-design-reviewer.md) | be-sql-design-guard | `inherit` | pre-merge-review | Schema design review — indexes, constraints, column conventions |
| **be-stack-monitor** | [`agent-os/agents/be-stack-monitor.md`](../agents/be-stack-monitor.md) | *(inline)* | `inherit` | — | Periodic / continuous stack monitoring — health verdict + anomalies from the dashboards MCP data tools (never the HTML UI) |
| **be-tsdoc-coverage-reviewer** | [`agent-os/agents/be-tsdoc-coverage-reviewer.md`](../agents/be-tsdoc-coverage-reviewer.md) | be-tsdoc-export-guard *(check phase)* | `inherit` | — | TSDoc gap scan — missing summaries and @remarks |
| **be-verifier** | [`agent-os/agents/be-verifier.md`](../agents/be-verifier.md) | *(inline)* | `inherit` | pre-merge-review | After claiming work complete — scoped validate/tests + wiring check |
<!-- GENERATED:END -->

> Each agent is read-only (Cursor `readonly`, a Claude `tools` allowlist without write tools, and
> `disallowedTools` listing them; its Bash can still write, so the prompts forbid it).
> Most wrap a project skill (diagnostic → procedural handoff: the agent finds, the skill fixes);
> `be-verifier`, `be-changelog-reviewer`, and `be-stack-monitor` run inline logic.
> Every agent is `model: inherit` with no `effort` (for now, since 18 Oct 2026): it runs on the
> model and effort of the session that starts it. Per-job routing (Opus, Sonnet or Haiku by job)
> is set aside; the **Model** column above renders the field.
> Report-only agents set `background: true`; the mechanical ones also set `omitClaudeMd: true`.
> Claude Code ignores an unknown field silently, so `pnpm agent-os:check` validates these.
