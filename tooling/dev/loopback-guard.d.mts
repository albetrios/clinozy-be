import type { IncomingMessage } from 'node:http';

export const LOOPBACK_HOST: '127.0.0.1';

export function createLoopbackGuard(options: { port: number }): {
  sessionToken: string;
  rejectionFor(
    request: Pick<IncomingMessage, 'headers' | 'url'>,
    options: { requireSessionToken: boolean; checkOrigin?: boolean },
  ): { status: 403; error: string } | null;
  announcedUrl(pathname?: string): string;
};
