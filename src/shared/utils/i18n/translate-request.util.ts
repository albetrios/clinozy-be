import type { FastifyRequest } from 'fastify';

/**
 * Resolves a user-facing message when `request.t` may be absent (e.g. early middleware).
 */
export function translateRequestMessage({
  request,
  messageKey,
  fallback,
  params,
}: {
  request: Pick<FastifyRequest, 't'>;
  messageKey: string;
  fallback: string;
  params?: Record<string, string | number> | undefined;
}): string {
  const translate = request.t;
  if (translate) {
    return translate(messageKey, params ?? {});
  }
  return fallback;
}
