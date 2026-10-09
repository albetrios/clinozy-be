`src/infrastructure/ai/`

# AI infrastructure

## Purpose

The Anthropic Messages API primitive (launch D80): one Claude completion — a system prompt and one
user turn in, the answer's text out — behind the shared `anthropic` circuit (see
[resilience.overview.md](src/infrastructure/resilience/resilience.overview.md)). Today its one
caller is the patients' AI offering ideas.

The app **domain** owns the business logic — the prompt, the de-identified summary, reading the
answer and storing the ideas in
[patient-ideas/](src/domains/app/sub-domains/patients/patient-ideas/); this module owns the call.

## Files

- `anthropic-messages.client.ts` — `createAnthropicMessage({ system, prompt, maxTokens })`: one
  `outboundFetchJson` call (integration `anthropic`) to `POST {ANTHROPIC_API_BASE_URL}/v1/messages`
  with `x-api-key`, `anthropic-version: 2023-06-01` and `PATIENT_IDEAS_AI_MODEL`; joins the answer's
  text blocks.
- `anthropic-error.util.ts` — `AnthropicApiError`: a 429 or 529 (overloaded) is a throttle (the
  queue waits `retry-after`, else a minute); another 4xx except 401 / 403 is the request's own fault;
  neither counts against the circuit. A bad key, a 5xx, a timeout and a network failure do.
- `anthropic-messages.config.ts` — `isPatientIdeasAiEnabled()` (`PATIENT_IDEAS_AI_ENABLED`), kept
  apart so the queue registry and the route load without the circuit.

## Design decisions

- **No SDK** — one `fetch` through the hardened outbound layer (timeouts, redaction, the circuit),
  like Meta and Turnstile; the request shape is pinned by
  `src/tests/contract/anthropic-messages.contract.test.ts`.
- **Network I/O outside RLS contexts**: the ideas worker reads in one short context, calls Claude,
  then writes in another (`rls-context-network-isolation.global.test.ts`).
- **What leaves the clinic**: only the de-identified summary the patient-ideas repository builds
  (complaint and diagnosis labels, treatment names by month, packages, visit count, planned
  offerings) and the clinic's menu — never a name, a phone, an id of the patient — and only for a
  patient with Data consent.

## Operational concerns

- Off by default (`PATIENT_IDEAS_AI_ENABLED=false`); the env layer requires `ANTHROPIC_API_KEY` when
  it is on. Off, the patient file shows the prototype's rules and the two ideas workers do not start.
- The ideas worker pauses its queue while the `anthropic` circuit is open or Anthropic throttles.

## External dependencies

- Anthropic Messages API (`ANTHROPIC_API_BASE_URL`, default `https://api.anthropic.com`;
  `ANTHROPIC_HTTP_TIMEOUT_MS`, default 60 s).
