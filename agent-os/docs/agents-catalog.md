# Agent catalog (clinozy-be)

<!-- GENERATED:START -->
All 13 project agents — each read-only. Generated from `agents/*.md` frontmatter
and `agents/pipelines.json`. See [platform-access.md](platform-access.md) for how to invoke on each platform.

| Agent | File | Wraps skill | Model (routing rationale) | Pipelines | Use when |
| ----- | ---- | ----------- | ------------------------- | --------- | -------- |
| **be-changelog-reviewer** | [`agent-os/agents/be-changelog-reviewer.md`](../agents/be-changelog-reviewer.md) | *(inline)* | `haiku` — mechanical diff/log/PR-title scan — no deep reasoning, Haiku | — | Verify CHANGELOG.md vs git log / merged PR titles — gap report |
| **be-ci-investigator** | [`agent-os/agents/be-ci-investigator.md`](../agents/be-ci-investigator.md) | be-ci-investigation | `sonnet` — root-cause diagnosis from noisy CI logs — Sonnet, medium effort (by job, 17 Oct) | — | One failing CI job — root-cause summary without log noise |
| **be-dependency-auditor** | [`agent-os/agents/be-dependency-auditor.md`](../agents/be-dependency-auditor.md) | be-dependency-security | `sonnet` — parses pnpm audit and maps severities to a fix plan — Sonnet, medium effort | prod-readiness | pnpm audit — vulnerabilities + prioritized fix plan |
| **be-docs-auditor** | [`agent-os/agents/be-docs-auditor.md`](../agents/be-docs-auditor.md) | be-docs-audit | `sonnet` — index/link/naming/Mermaid scan with judgement on drift — Sonnet, medium effort | — | Full docs/ audit — stale links, index gaps, Mermaid issues |
| **be-i18n-auditor** | [`agent-os/agents/be-i18n-auditor.md`](../agents/be-i18n-auditor.md) | be-i18n-message-guard | `sonnet` — i18n classification (is this string user-facing?) + locale key-graph — Sonnet, medium effort | — | i18n audit — untranslated payload strings, locale key parity and drift |
| **be-idempotency-reviewer** | [`agent-os/agents/be-idempotency-reviewer.md`](../agents/be-idempotency-reviewer.md) | be-idempotency-guard | `sonnet` — a contract checklist over the touched routes — Sonnet, medium effort | pre-merge-review | Pre-merge review of a diff that touches routes, controllers, billing or Stripe calls |
| **be-production-hardening-reviewer** | [`agent-os/agents/be-production-hardening-reviewer.md`](../agents/be-production-hardening-reviewer.md) | be-production-hardening-guard | `opus` — infra/security judgement across the stack — frontier reasoning (Opus, high effort) | pre-merge-review, prod-readiness | Targeted hardening sweep — security headers, DB/Redis/worker gaps |
| **be-production-reviewer** | [`agent-os/agents/be-production-reviewer.md`](../agents/be-production-reviewer.md) | be-path-to-production-gate + be-production-hardening-guard | `opus` — full production-readiness synthesis — frontier reasoning (Opus, high effort) | prod-readiness | Pre-release / deploy sign-off — full readiness plan |
| **be-rls-reviewer** | [`agent-os/agents/be-rls-reviewer.md`](../agents/be-rls-reviewer.md) | be-rls-tenant-isolation-guard | `opus` — a missed policy arm is a cross-organization data leak — frontier reasoning (Opus, high effort) | pre-merge-review | Pre-merge review of a diff that touches tables, migrations, repositories, workers or database contexts |
| **be-sql-design-reviewer** | [`agent-os/agents/be-sql-design-reviewer.md`](../agents/be-sql-design-reviewer.md) | be-sql-design-guard | `sonnet` — schema design trade-offs (indexes/partitioning) — Sonnet, medium effort (by job, 17 Oct) | pre-merge-review | Schema design review — indexes, constraints, column conventions |
| **be-stack-monitor** | [`agent-os/agents/be-stack-monitor.md`](../agents/be-stack-monitor.md) | *(inline)* | `haiku` — reads health signals per cycle and flags regressions — mechanical, Haiku | — | Periodic / continuous stack monitoring — health verdict + anomalies from the dashboards MCP data tools (never the HTML UI) |
| **be-tsdoc-coverage-reviewer** | [`agent-os/agents/be-tsdoc-coverage-reviewer.md`](../agents/be-tsdoc-coverage-reviewer.md) | be-tsdoc-export-guard *(check phase)* | `sonnet` — runs tsdoc:check and lists gaps — Sonnet, medium effort | — | TSDoc gap scan — missing summaries and @remarks |
| **be-verifier** | [`agent-os/agents/be-verifier.md`](../agents/be-verifier.md) | *(inline)* | `opus` — adversarial validation across edge cases — frontier reasoning (Opus, high effort) | pre-merge-review | After claiming work complete — scoped validate/tests + wiring check |
<!-- GENERATED:END -->

> Each agent is read-only (Cursor `readonly`, a Claude `tools` allowlist without write tools, and
> `disallowedTools` listing them; its Bash can still write, so the prompts forbid it).
> Most wrap a project skill (diagnostic → procedural handoff: the agent finds, the skill fixes);
> `be-verifier`, `be-changelog-reviewer`, and `be-stack-monitor` run inline logic.
> Model routing is set by job and rendered in the **Model** column above: `opus` + `effort: high`
> for the verifier and the production reviewers (judgment calls), `sonnet` + `medium` for the
> auditors and the CI investigator, `haiku` + `low` for the stack monitor and the changelog check.
> Report-only agents set `background: true`; the mechanical ones also set `omitClaudeMd: true`.
> Claude Code ignores an unknown field silently, so `pnpm agent-os:check` validates these.
