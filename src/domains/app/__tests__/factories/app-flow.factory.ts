import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import type {
  AppFixture,
  AppFixtureRole,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { type JsonValue, jsonQuery } from '@/tests/helpers/json-query.helper.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { injectAuthenticated, injectRoute } from '@/tests/helpers/test-http-inject.helper.js';

/** HTTP methods the app routes answer. */
export type AppFlowMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Per-call options of {@link AppFlow.call}. */
export interface AppFlowCallOptions {
  /** `false` sends a POST without `X-Idempotency-Key`; a string sends that key. */
  idempotencyKey?: string | false;
  /** Sent as `Accept-Language`. */
  language?: string;
  /** No `Authorization` header. */
  anonymous?: boolean;
}

/** One answer of {@link AppFlow.call}. */
export interface AppFlowResponse {
  status: number;
  body: JsonValue;
}

/** The longest body excerpt an assertion message carries. */
const BODY_EXCERPT_LENGTH = 600;

/**
 * A soft assertion inside a test, so one run reports every failed step of a flow; a hard one in a
 * hook (`beforeAll` setup), where Vitest has no test to attach a soft failure to.
 */
function check(actual: unknown, message: string) {
  return expect.getState().currentTestName === undefined
    ? expect(actual, message)
    : expect.soft(actual, message);
}

/**
 * A request flow over the app routes for the app suites: act as a fixture member, call a route
 * under `/api/v1`, assert its status, read the last body with a jq expression.
 *
 * @remarks
 * - **Algorithm:** every POST carries a fresh `X-Idempotency-Key` unless told otherwise, like the
 *   curl helper; the last answer is kept for {@link AppFlow.last} and the value checks.
 * - **Failure modes:** inside a test, status and value checks are soft (`expect.soft`), so one run
 *   reports every failed step of a flow; a step that reads an id from a failed call then fails on
 *   its own. In a hook (the suite's `beforeAll` setup) they are hard — the setup stops at once.
 */
export class AppFlow {
  private token: string;
  private lastResponse: AppFlowResponse = { status: 0, body: null };

  constructor(
    private readonly app: FastifyInstance,
    private readonly fixture: AppFixture,
  ) {
    this.token = fixture.members.owner.token;
  }

  /** Act as this fixture member from now on. */
  as(role: AppFixtureRole): this {
    this.token = this.fixture.members[role].token;
    return this;
  }

  /** Act with this bearer token from now on (a member made by the suite itself). */
  withToken(token: string): this {
    this.token = token;
    return this;
  }

  /** One request; keeps the answer for {@link AppFlow.last}. */
  async call(
    method: AppFlowMethod,
    path: string,
    body?: unknown,
    options: AppFlowCallOptions = {},
  ): Promise<AppFlowResponse> {
    const headers: Record<string, string> = {};
    if (method === 'POST' && options.idempotencyKey !== false) {
      headers['x-idempotency-key'] = options.idempotencyKey ?? `flow-${randomUUID()}`;
    }
    if (options.language) headers['accept-language'] = options.language;
    if (typeof body === 'string') headers['content-type'] = 'application/json';
    const request = {
      method,
      url: testApiPath(path),
      headers,
      ...(body === undefined ? {} : { payload: body }),
    };
    const response = options.anonymous
      ? await injectRoute(this.app, request)
      : await injectAuthenticated(this.app, { ...request, token: this.token });
    let parsed: JsonValue = null;
    if (response.body.length > 0) {
      try {
        parsed = response.json() as JsonValue;
      } catch {
        parsed = response.body;
      }
    }
    this.lastResponse = { status: response.statusCode, body: parsed };
    return this.lastResponse;
  }

  /** {@link AppFlow.call}, then the answer must be `status`; returns the body. */
  async expect(
    status: number,
    label: string,
    method: AppFlowMethod,
    path: string,
    body?: unknown,
    options?: AppFlowCallOptions,
  ): Promise<JsonValue> {
    const response = await this.call(method, path, body, options);
    check(
      response.status,
      `${label} — ${method} ${path} → ${JSON.stringify(response.body).slice(0, BODY_EXCERPT_LENGTH)}`,
    ).toBe(status);
    return response.body;
  }

  /** The last answer's body. */
  lastBody(): JsonValue {
    return this.lastResponse.body;
  }

  /** The last answer through a jq expression, as `jq -r` prints it. */
  last(expression: string): string {
    try {
      return jsonQuery(this.lastResponse.body, expression);
    } catch {
      return '';
    }
  }

  /** The last answer's `expression` must print `want`. */
  expectValue(label: string, expression: string, want: string | number | boolean): void {
    check(this.last(expression), label).toBe(String(want));
  }

  /** Two computed values must match. */
  expectEqual(label: string, got: string, want: string): void {
    check(got, label).toBe(want);
  }
}

/**
 * The fixture organization's calendar day `offset` days from now, as `YYYY-MM-DD` — the twin of
 * the curl helper's `calendar_day`.
 */
export function calendarDay(fixture: AppFixture, offset: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fixture.organization.timezone }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}
