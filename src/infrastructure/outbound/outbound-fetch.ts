import {
  classifyOutboundError,
  ExternalServiceError,
} from '@/infrastructure/outbound/outbound-error.js';
import { buildOutboundCallOptions, outboundCall } from '@/infrastructure/outbound/outbound-call.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import {
  resolveOutboundDefaults,
  type OutboundIntegrationName,
} from '@/infrastructure/outbound/outbound-defaults.js';

const REQUEST_ID_HEADER = 'X-Request-Id';

/** Fetch-compatible callable; defaults to `globalThis.fetch` and is overridden in tests. */
export type OutboundFetchImplementation = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Resolved options accepted by {@link outboundFetch}. Use {@link buildOutboundFetchOptions}
 * to construct one from a partial {@link OutboundFetchOptionsInput} value.
 */
export interface OutboundFetchOptions {
  name: OutboundIntegrationName;
  url: string;
  init?: RequestInit;
  requestId?: string;
  fetchImplementation?: OutboundFetchImplementation;
  expectedStatus?: number | number[];
  classifyResponseError?: (response: Response, body: string) => Error | undefined;
}

/**
 * Loose form of {@link OutboundFetchOptions} that permits explicit `undefined` on each
 * optional field so callers can spread partial values without violating
 * `exactOptionalPropertyTypes`.
 */
export type OutboundFetchOptionsInput = {
  name: OutboundIntegrationName;
  url: string;
  init?: RequestInit | undefined;
  requestId?: string | undefined;
  fetchImplementation?: OutboundFetchImplementation | undefined;
  expectedStatus?: number | number[] | undefined;
  classifyResponseError?: ((response: Response, body: string) => Error | undefined) | undefined;
};

/** Strips `undefined` keys from {@link OutboundFetchOptionsInput} to produce {@link OutboundFetchOptions}. */
export function buildOutboundFetchOptions(
  options: OutboundFetchOptionsInput,
): OutboundFetchOptions {
  return omitUndefined(options) as OutboundFetchOptions;
}

function buildHeaders(options: {
  init?: RequestInit | undefined;
  requestId?: string | undefined;
}): Headers {
  const headers = new Headers(options.init?.headers);
  const requestId = options.requestId;
  if (requestId) {
    headers.set(REQUEST_ID_HEADER, requestId);
  }
  return headers;
}

function isExpectedStatus(status: number, expected: number | number[]): boolean {
  if (Array.isArray(expected)) {
    return expected.includes(status);
  }
  return status === expected;
}

async function readResponseBodyForClassification(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** Inputs for {@link runOutboundFetch}: the fetch to make and how to read its response. */
interface RunOutboundFetchOptions<T> {
  fetchOptions: OutboundFetchOptions;
  readResponse: (response: Response) => Promise<T>;
}

/**
 * One outbound fetch with the integration's timeout and circuit; `readResponse` runs inside the
 * same call, so the timeout and the error classification cover reading the body too.
 */
async function runOutboundFetch<T>({
  fetchOptions,
  readResponse,
}: RunOutboundFetchOptions<T>): Promise<T> {
  const defaults = resolveOutboundDefaults(fetchOptions.name);
  const fetchImplementation = fetchOptions.fetchImplementation ?? globalThis.fetch.bind(globalThis);
  const headers = buildHeaders({
    ...(fetchOptions.init !== undefined ? { init: fetchOptions.init } : {}),
    ...(fetchOptions.requestId !== undefined ? { requestId: fetchOptions.requestId } : {}),
  });

  return outboundCall(
    buildOutboundCallOptions({
      name: fetchOptions.name,
      timeoutMs: defaults.timeoutMs,
      circuit: defaults.circuit ?? null,
      requestId: fetchOptions.requestId,
      operation: async (signal) => {
        const response = await fetchImplementation(fetchOptions.url, {
          ...fetchOptions.init,
          headers,
          signal,
        });

        const expectedStatus = fetchOptions.expectedStatus;
        if (expectedStatus !== undefined && !isExpectedStatus(response.status, expectedStatus)) {
          const body = await readResponseBodyForClassification(response);
          const customError = fetchOptions.classifyResponseError?.(response, body);
          if (customError) {
            throw customError;
          }

          const category = response.status >= 500 ? 'http_5xx' : 'http_4xx';
          const upstreamRequestId = response.headers.get(REQUEST_ID_HEADER);
          throw new ExternalServiceError({
            integration: fetchOptions.name,
            category,
            status: response.status,
            ...(upstreamRequestId ? { upstreamRequestId } : {}),
            fallbackMessage: `Outbound fetch to ${fetchOptions.name} returned HTTP ${response.status}`,
          });
        }

        return readResponse(response);
      },
    }),
  ).catch((error) => {
    if (error instanceof ExternalServiceError) {
      throw error;
    }
    throw classifyOutboundError(error, fetchOptions.name);
  });
}

/**
 * HTTP outbound helper: timeout, optional circuit/retry via {@link outboundCall}, request-id header,
 * and status-based {@link ExternalServiceError} classification.
 *
 * @remarks
 * - **Algorithm:** fetches with the integration's timeout and circuit; a status outside
 *   `expectedStatus` throws `ExternalServiceError` (`http_4xx` / `http_5xx`).
 * - **Failure modes:** every failure is an `ExternalServiceError` (503 at the HTTP layer).
 * - **Side effects:** one HTTP request; adds `X-Request-Id` when a request id is given.
 * - **Notes:** the timeout does not cover reading the body afterwards — read JSON with
 *   {@link outboundFetchJson}.
 */
export async function outboundFetch(options: OutboundFetchOptions): Promise<Response> {
  return runOutboundFetch({ fetchOptions: options, readResponse: async (response) => response });
}

/**
 * {@link outboundFetch} that also reads the JSON body inside the outbound call.
 *
 * @remarks
 * - **Algorithm:** the same fetch, then `response.json()` under the same timeout.
 * - **Failure modes:** a body that times out or is not JSON is the integration failing — an
 *   `ExternalServiceError` like any other outbound failure, never a raw `SyntaxError` /
 *   `TimeoutError` that would surface as a 500.
 * - **Side effects:** one HTTP request.
 * - **Notes:** the payload is cast, not validated — check the fields you rely on.
 */
export async function outboundFetchJson<T>(options: OutboundFetchOptions): Promise<T> {
  return runOutboundFetch({
    fetchOptions: options,
    readResponse: async (response) => (await response.json()) as T,
  });
}
