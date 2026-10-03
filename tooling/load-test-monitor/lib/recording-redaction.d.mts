import type { IncomingHttpHeaders } from 'node:http';

export function redactHeaders(headers: IncomingHttpHeaders): Record<string, string>;

export function redactQuery(search: string): string;

export function redactBody(
  buffer: Buffer | undefined,
  contentType: string | string[] | undefined,
): string;
