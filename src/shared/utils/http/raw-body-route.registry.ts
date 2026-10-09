/**
 * Live registry of the signed-webhook routes whose raw HTTP body must be kept for HMAC
 * verification — the Stripe webhook (`Stripe-Signature`, sec-B finding #7) and the messaging
 * webhook (`X-Hub-Signature-256`, launch D77).
 *
 * @remarks
 * Prior to sec-B #7, the content-type parser in `src/app.ts` checked a hardcoded `Set<string>` of
 * webhook paths. Two files had to stay in lockstep on the *exact* URLs or every signature
 * verification silently failed for the provider's retry window — and the `JSON.stringify`
 * fallback in the ingress plugin masked the misconfiguration as "every webhook is rejected"
 * rather than "wiring drifted."
 *
 * Each webhook routes module adds its URLs at registration time (an `onRoute` hook over
 * `config.captureRawBody`), with the signature header its provider sends. The content-type parser
 * reads the registry on every request and keeps the raw body only for a registered URL that
 * carries that header — so a rename of a webhook URL is reflected automatically, and an unsigned
 * request never has its body buffered.
 */
const signatureHeaderByUrl = new Map<string, string>();

/**
 * Called by a webhook routes module (via its `onRoute` hook) for every route whose
 * `routeOptions.config.captureRawBody === true`: the route URL — already prefix-applied by
 * Fastify — and the lower-case signature header its provider signs with.
 */
export function registerRawBodyRoute(options: { url: string; signatureHeader: string }): void {
  signatureHeaderByUrl.set(options.url, options.signatureHeader.toLowerCase());
}

/**
 * Called by the content-type parser in `src/app.ts`: whether to keep the raw body buffer on
 * `request.rawBody` — only for a registered URL (exact match) whose request carries that route's
 * signature header.
 */
export function shouldCaptureRawBody(request: {
  url: string;
  headers: Record<string, unknown>;
}): boolean {
  const path = request.url.split('?')[0] ?? request.url;
  const signatureHeader = signatureHeaderByUrl.get(path);
  return signatureHeader !== undefined && request.headers[signatureHeader] !== undefined;
}

/** Returns a snapshot of the registered URLs — for tests and the boot-time sanity log only. */
export function listRawBodyRoutes(): readonly string[] {
  return Array.from(signatureHeaderByUrl.keys());
}
