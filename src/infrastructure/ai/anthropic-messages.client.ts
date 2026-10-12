import { env } from '@/shared/config/env.config.js';
import { buildOutboundFetchOptions, outboundFetchJson } from '@/infrastructure/outbound/index.js';
import {
  ANTHROPIC_INCOMPLETE_STOP_REASONS,
  AnthropicApiError,
  AnthropicIncompleteAnswerError,
  type AnthropicIncompleteStopReason,
} from '@/infrastructure/ai/anthropic-error.util.js';

/** The Messages API version every request names. */
const ANTHROPIC_API_VERSION = '2023-06-01';

/** A Messages API answer — only what the caller reads. */
interface MessagesAnswer {
  content?: { type?: unknown; text?: unknown }[];
  stop_reason?: unknown;
}

/** Whether a stop reason means Claude did not finish its answer. */
function isIncompleteStopReason(stopReason: unknown): stopReason is AnthropicIncompleteStopReason {
  return (ANTHROPIC_INCOMPLETE_STOP_REASONS as readonly unknown[]).includes(stopReason);
}

/**
 * One Claude completion through the Anthropic Messages API (launch D80) — the system prompt and
 * one user turn in, the answer's text out.
 *
 * @remarks
 * - **Algorithm:** `POST {ANTHROPIC_API_BASE_URL}/v1/messages` with the API key, the API version,
 *   `PATIENT_IDEAS_AI_MODEL`, `max_tokens` and the two prompts; joins the answer's text blocks.
 * - **Failure modes:** `Error('anthropic_api_key_missing')` without a key;
 *   {@link AnthropicIncompleteAnswerError} when Claude stopped on `max_tokens` or `refusal` — the
 *   partial text is never handed back as if it were the answer;
 *   {@link AnthropicApiError} for an error answer (inside an `ExternalServiceError` from
 *   `outboundCall`); `ExternalServiceError` for a timeout, a network failure or the `anthropic`
 *   circuit open.
 * - **Side effects:** one HTTPS request to Anthropic — never inside a database context.
 */
export async function createAnthropicMessage(options: {
  system: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('anthropic_api_key_missing');
  const answer = await outboundFetchJson<MessagesAnswer>(
    buildOutboundFetchOptions({
      name: 'anthropic',
      url: `${env.ANTHROPIC_API_BASE_URL}/v1/messages`,
      init: {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: env.PATIENT_IDEAS_AI_MODEL,
          max_tokens: options.maxTokens,
          system: options.system,
          messages: [{ role: 'user', content: options.prompt }],
        }),
      },
      expectedStatus: 200,
      classifyResponseError: (response, body) =>
        new AnthropicApiError({
          statusCode: response.status,
          body,
          retryAfterSeconds: response.headers.get('retry-after'),
        }),
    }),
  );
  if (isIncompleteStopReason(answer.stop_reason)) {
    throw new AnthropicIncompleteAnswerError(answer.stop_reason);
  }
  return (answer.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('');
}
