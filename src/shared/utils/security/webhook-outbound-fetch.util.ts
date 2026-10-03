import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { ValidationError } from '@/shared/errors/index.js';
import { env } from '@/shared/config/env.config.js';
import {
  assertWebhookUrlSafe,
  type WebhookResolvedAddress,
} from '@/shared/utils/security/webhook-url.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';

/** A fetch-compatible function returned by {@link createPinnedWebhookFetch}. */
export type PinnedWebhookFetch = typeof globalThis.fetch;

/**
 * Hard ceiling on the response body a webhook target may return (64 KB). Enforced while
 * streaming so a hostile or buggy endpoint cannot exhaust worker memory; the connection is
 * destroyed and the fetch rejected the moment the limit is crossed.
 */
export const WEBHOOK_RESPONSE_BODY_MAX_BYTES = 64 * 1024;

/** The pinned target produced by {@link resolveAndPinWebhookUrl}: parsed URL, IP, and resolved port. */
export type PinnedWebhookResolution = {
  parsed: URL;
  pinnedAddress: string;
  port: number;
};

function parseWebhookAllowlist(): string[] {
  const raw = env.WEBHOOK_URL_ALLOWLIST;
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function assertWebhookHostAllowed(hostname: string): void {
  const allowlist = parseWebhookAllowlist();
  if (allowlist.length === 0) {
    if (env.WEBHOOK_ALLOWLIST_REQUIRED) {
      throw new ValidationError('errors:webhookUrlAllowlistRequired', undefined, undefined, [
        { field: 'url', messageKey: 'errors:webhookUrlAllowlistRequired' },
      ]);
    }
    return;
  }
  const normalizedHost = hostname.toLowerCase();
  const allowed = allowlist.some((entry) => {
    if (entry.startsWith('*.')) {
      // Explicit wildcard — *.example.com permits any subdomain but not the apex itself.
      const baseDomain = entry.slice(2);
      return normalizedHost.endsWith(`.${baseDomain}`);
    }
    return normalizedHost === entry;
  });
  if (!allowed) {
    throw new ValidationError('errors:webhookUrlNotAllowed', undefined, undefined, [
      { field: 'url', messageKey: 'errors:webhookUrlNotAllowed' },
    ]);
  }
}

function pickPinnedAddress(addresses: WebhookResolvedAddress[]): string {
  const first = addresses[0];
  if (!first) {
    throw new ValidationError('errors:webhookUrlDnsFailed', undefined, undefined, [
      { field: 'url', messageKey: 'errors:webhookUrlDnsFailed' },
    ]);
  }
  return first.address;
}

function resolveWebhookPort(parsed: URL): number {
  if (parsed.port !== '') {
    return Number.parseInt(parsed.port, 10);
  }
  return parsed.protocol === 'https:' ? 443 : 80;
}

/**
 * Fetch "null body statuses" a `Response` can represent: the constructor throws when one of
 * them is given any body — even an empty `Buffer` — so they must be built with `null`.
 * (101 and 103 are null-body too, but outside the 200–599 range `Response` accepts at all.)
 */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

/**
 * Converts a webhook target's completed HTTP response into a Fetch `Response`.
 *
 * @remarks
 * Every input here is chosen by the remote endpoint, so the conversion can throw: a status
 * `Response` cannot represent (outside 200–599), or a header value `Headers` rejects. The
 * caller runs it inside a try/catch and turns a throw into a rejection of the fetch promise —
 * it executes in an asynchronous `end` listener, where an escaped exception would reach the
 * process-wide fatal handler and stop the API or worker. A null-body status (204, 205, 304)
 * gets a `null` body, never the empty buffer of collected chunks.
 */
export function toWebhookFetchResponse(options: {
  statusCode: number | undefined;
  statusMessage: string | undefined;
  headers: IncomingHttpHeaders;
  body: Buffer;
}): Response {
  const status = options.statusCode ?? 500;
  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(options.headers)) {
    if (value === undefined) continue;
    responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return new Response(
    NULL_BODY_STATUSES.has(status) ? null : options.body,
    omitUndefined({ status, statusText: options.statusMessage, headers: responseHeaders }),
  );
}

/** Settles a fetch promise exactly once; later calls are no-ops. */
type OnceSettler = {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};

function createOnceSettler(options: {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  onSettled: () => void;
}): OnceSettler {
  let settled = false;
  const claim = (): boolean => {
    if (settled) return false;
    settled = true;
    options.onSettled();
    return true;
  };
  return {
    resolve: (response) => {
      if (claim()) options.resolve(response);
    },
    reject: (error) => {
      if (claim()) options.reject(error);
    },
  };
}

/**
 * Collects a webhook target's response body (capped at {@link WEBHOOK_RESPONSE_BODY_MAX_BYTES})
 * and settles the fetch. These listeners run after the promise executor has returned, so
 * nothing may throw out of them: success, a conversion failure, a stream error and an early
 * close all go through `settler`.
 */
function collectWebhookResponse(
  response: IncomingMessage,
  destroyRequest: () => void,
  settler: OnceSettler,
): void {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  let exceededLimit = false;
  response.on('data', (chunk: Buffer) => {
    if (exceededLimit) return;
    receivedBytes += chunk.length;
    if (receivedBytes > WEBHOOK_RESPONSE_BODY_MAX_BYTES) {
      exceededLimit = true;
      destroyRequest();
      settler.reject(new Error('webhook.fetch.response_too_large'));
      return;
    }
    chunks.push(chunk);
  });
  response.on('end', () => {
    if (exceededLimit) return;
    let fetchResponse: Response;
    try {
      fetchResponse = toWebhookFetchResponse({
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        headers: response.headers,
        body: Buffer.concat(chunks),
      });
    } catch (error) {
      settler.reject(new Error('webhook.fetch.invalid_response', { cause: error }));
      return;
    }
    settler.resolve(fetchResponse);
  });
  response.on('error', settler.reject);
  // `close` follows `end` on success (already settled, so a no-op); without `end` it means the
  // connection dropped mid-body.
  response.on('close', () => settler.reject(new Error('webhook.fetch.connection_closed')));
}

async function pinnedNodeFetch(
  targetUrl: URL,
  pinnedAddress: string,
  port: number,
  init?: RequestInit,
): Promise<Response> {
  const isHttps = targetUrl.protocol === 'https:';
  const requestFunction = isHttps ? httpsRequest : httpRequest;
  const headerRecord: Record<string, string> = {};
  if (init?.headers) {
    const headers = new Headers(init.headers);
    headers.forEach((value, key) => {
      // eslint-disable-next-line security/detect-object-injection -- key from Headers iteration (server-controlled outbound request).
      headerRecord[key] = value;
    });
  }
  headerRecord.host = targetUrl.hostname;

  return new Promise((resolve, reject) => {
    // Every outcome — success, a conversion failure, a stream error, an early close, an abort —
    // settles the promise exactly once, and the delivery's own retry handling takes it from there.
    const signal = init?.signal;
    const onAbort = (): void => {
      request.destroy();
      settler.reject(new Error('webhook.fetch.aborted'));
    };
    const settler = createOnceSettler({
      resolve,
      reject,
      onSettled: () => signal?.removeEventListener('abort', onAbort),
    });

    const request = requestFunction(
      {
        host: pinnedAddress,
        port,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: init?.method ?? 'GET',
        headers: headerRecord,
        servername: isHttps ? targetUrl.hostname : undefined,
      },
      // `destroyRequest` reads `request` lazily: the response arrives after `requestFunction`
      // has returned and `request` is assigned.
      (response) => collectWebhookResponse(response, () => request.destroy(), settler),
    );

    request.on('error', settler.reject);

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const body = init?.body;
    if (body === undefined || body === null) {
      request.end();
      return;
    }
    if (typeof body === 'string') {
      request.end(body);
      return;
    }
    if (body instanceof Uint8Array) {
      request.end(body);
      return;
    }
    request.destroy();
    settler.reject(new Error('webhook.fetch.unsupported_body_type'));
  });
}

/**
 * Resolves webhook DNS once, validates SSRF rules + optional hostname allowlist, and returns a pinned target.
 * Outbound delivery must use this (or {@link createPinnedWebhookFetch}) so DNS rebinding cannot redirect fetches.
 */
export async function resolveAndPinWebhookUrl(
  webhookUrl: string,
): Promise<PinnedWebhookResolution> {
  const addresses = await assertWebhookUrlSafe(webhookUrl);
  const parsed = new URL(webhookUrl);
  assertWebhookHostAllowed(parsed.hostname);
  return {
    parsed,
    pinnedAddress: pickPinnedAddress(addresses),
    port: resolveWebhookPort(parsed),
  };
}

/**
 * Returns a fetch implementation that connects to the IP from a single pre-delivery DNS resolution
 * while preserving the original Host header and TLS SNI.
 */
export async function createPinnedWebhookFetch(webhookUrl: string): Promise<PinnedWebhookFetch> {
  const { pinnedAddress, port } = await resolveAndPinWebhookUrl(webhookUrl);

  return (input, init) => {
    let targetUrl: URL;
    if (typeof input === 'string') {
      targetUrl = new URL(input);
    } else if (input instanceof URL) {
      targetUrl = input;
    } else {
      targetUrl = new URL(input.url);
    }
    return pinnedNodeFetch(targetUrl, pinnedAddress, port, init);
  };
}
