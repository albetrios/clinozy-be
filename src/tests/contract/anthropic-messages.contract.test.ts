import nock from 'nock';
import { describe, expect, test, vi } from 'vitest';

// The client reads the key and the model from the env; pin both so the request is deterministic.
vi.mock('@/shared/config/env.config.js', async () => {
  const actual = await vi.importActual<typeof import('@/shared/config/env.config.js')>(
    '@/shared/config/env.config.js',
  );
  const envWithAnthropic = {
    ...actual.env,
    ANTHROPIC_API_KEY: 'test-anthropic-api-key',
    ANTHROPIC_API_BASE_URL: 'https://api.anthropic.com',
    PATIENT_IDEAS_AI_MODEL: 'claude-opus-5-5',
  };
  return { ...actual, env: envWithAnthropic, getEnv: () => envWithAnthropic };
});

import { createAnthropicMessage } from '@/infrastructure/ai/anthropic-messages.client.js';
import {
  AnthropicIncompleteAnswerError,
  findAnthropicApiError,
} from '@/infrastructure/ai/anthropic-error.util.js';
import { registerThirdPartyContractTestIsolationHooks } from './helpers/register-contract-test-hooks.js';

registerThirdPartyContractTestIsolationHooks();

const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';
const MESSAGES_PATH = '/v1/messages';

/** A failed call's classified Anthropic error. */
async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  return findAnthropicApiError(error);
}

/**
 * Contract test for the Anthropic Messages API (launch D80 — the patient AI ideas). Pins the
 * request the ideas worker sends (headers, model, prompts, token budget) and how each kind of
 * answer reads back: the text blocks joined, a throttle, a refused request, an outage.
 */
describe('Anthropic Messages API contract', () => {
  test('POSTs the key, the API version, the model and both prompts; joins the text blocks', async () => {
    let captured: Record<string, unknown> | undefined;
    nock(ANTHROPIC_ORIGIN)
      .post(MESSAGES_PATH, (body) => {
        captured = body as Record<string, unknown>;
        return true;
      })
      .matchHeader('x-api-key', 'test-anthropic-api-key')
      .matchHeader('anthropic-version', '2023-06-01')
      .matchHeader('content-type', /application\/json/)
      .reply(200, {
        id: 'msg_contract',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: '{"ideas":' },
          { type: 'tool_use', id: 'toolu_x', name: 'ignored', input: {} },
          { type: 'text', text: '[]}' },
        ],
        stop_reason: 'end_turn',
      });

    const text = await createAnthropicMessage({
      system: 'You suggest offerings.',
      prompt: '{"patient":{}}',
      maxTokens: 1024,
    });

    expect(text).toBe('{"ideas":[]}');
    expect(captured).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      system: 'You suggest offerings.',
      messages: [{ role: 'user', content: '{"patient":{}}' }],
    });
  });

  test.each(['max_tokens', 'refusal'] as const)(
    'never hands back the partial text of an answer that stopped on %s',
    async (stopReason) => {
      nock(ANTHROPIC_ORIGIN)
        .post(MESSAGES_PATH)
        .reply(200, {
          id: 'msg_incomplete',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: '{"ideas":[{"offering_id":"ofr_' }],
          stop_reason: stopReason,
        });

      const error = await createAnthropicMessage({ system: 's', prompt: 'p', maxTokens: 8 }).then(
        () => null,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(AnthropicIncompleteAnswerError);
      expect((error as AnthropicIncompleteAnswerError).stopReason).toBe(stopReason);
      // Anthropic answered: nothing here says it is down.
      expect(findAnthropicApiError(error)).toBeNull();
    },
  );

  test('reads a 429 as a throttle that waits as Anthropic asks', async () => {
    nock(ANTHROPIC_ORIGIN)
      .post(MESSAGES_PATH)
      .reply(
        429,
        { type: 'error', error: { type: 'rate_limit_error', message: 'Slow down' } },
        { 'retry-after': '7' },
      );

    const error = await failure(createAnthropicMessage({ system: 's', prompt: 'p', maxTokens: 8 }));

    expect([error?.isRateLimited, error?.retryAfterMs, error?.countsAsCircuitFailure]).toEqual([
      true,
      7_000,
      false,
    ]);
  });

  test('reads a 529 (overloaded) as a throttle of a minute', async () => {
    nock(ANTHROPIC_ORIGIN)
      .post(MESSAGES_PATH)
      .reply(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });

    const error = await failure(createAnthropicMessage({ system: 's', prompt: 'p', maxTokens: 8 }));

    expect([error?.isRateLimited, error?.retryAfterMs, error?.errorType]).toEqual([
      true,
      60_000,
      'overloaded_error',
    ]);
  });

  test("reads a 400 as this request's own fault — not the circuit's", async () => {
    nock(ANTHROPIC_ORIGIN)
      .post(MESSAGES_PATH)
      .reply(400, {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'max_tokens: too large' },
      });

    const error = await failure(createAnthropicMessage({ system: 's', prompt: 'p', maxTokens: 8 }));

    expect([error?.isRequestRejection, error?.countsAsCircuitFailure, error?.reason]).toEqual([
      true,
      false,
      'max_tokens: too large',
    ]);
  });

  test('counts a revoked key against the circuit', async () => {
    nock(ANTHROPIC_ORIGIN)
      .post(MESSAGES_PATH)
      .reply(401, { type: 'error', error: { type: 'authentication_error', message: 'Bad key' } });

    const error = await failure(createAnthropicMessage({ system: 's', prompt: 'p', maxTokens: 8 }));

    expect([error?.statusCode, error?.isRequestRejection, error?.countsAsCircuitFailure]).toEqual([
      401,
      false,
      true,
    ]);
  });
});
