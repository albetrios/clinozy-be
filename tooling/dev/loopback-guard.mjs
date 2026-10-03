/**
 * Loopback guard for this repo's local developer servers (DB Viewer on 4984, Load Testing
 * Monitoring on 4985).
 *
 * A dev server bound to `127.0.0.1` is still reachable by every local process and — through DNS
 * rebinding — by any web page the developer has open. Three checks close that:
 *
 * - **Host header** must name the loopback listener (`127.0.0.1` / `localhost`, optionally with
 *   the port), so a rebound hostname (`attacker.example` resolving to 127.0.0.1) is refused.
 * - **Origin**, when a browser sends one, must be that same loopback origin, so a cross-origin page
 *   cannot drive the server. Non-browser clients (curl, k6) send no Origin and pass.
 * - **Session token** — random per boot, printed in the URL the server announces — gates the
 *   endpoints that disclose data or spend resources; an unrelated local process cannot guess it.
 *   Accepted as the `x-session-token` header or the `token` query parameter (EventSource cannot
 *   set headers).
 *
 * Node built-ins only, so a plain `node` server can import it.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** The only interface these servers listen on. */
export const LOOPBACK_HOST = '127.0.0.1';

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

/**
 * @param {{ port: number }} options
 */
export function createLoopbackGuard({ port }) {
  const sessionToken = randomBytes(16).toString('hex');

  function isValidSessionToken(provided) {
    if (typeof provided !== 'string' || provided.length !== sessionToken.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(sessionToken));
  }

  function isLocalHostHeader(host) {
    if (!host || typeof host !== 'string') return false;
    const value = host.trim().toLowerCase();
    return [...LOOPBACK_HOSTNAMES].some(
      (hostname) => value === hostname || value === `${hostname}:${port}`,
    );
  }

  function isLocalOrigin(origin) {
    if (!origin) return true; // same-origin navigations and non-browser clients omit Origin
    try {
      const url = new URL(origin);
      const portMatches = !url.port || Number(url.port) === Number(port);
      return (
        LOOPBACK_HOSTNAMES.has(url.hostname) &&
        portMatches &&
        (url.protocol === 'http:' || url.protocol === 'https:')
      );
    } catch {
      return false;
    }
  }

  /**
   * Why the request must be refused, or `null` when it may proceed.
   *
   * @param {import('node:http').IncomingMessage} request
   * @param {{ requireSessionToken: boolean, checkOrigin?: boolean }} options
   * @returns {{ status: 403, error: string } | null}
   */
  function rejectionFor(request, { requireSessionToken, checkOrigin = true }) {
    if (!isLocalHostHeader(request.headers.host)) return { status: 403, error: 'Invalid Host' };
    if (checkOrigin && !isLocalOrigin(request.headers.origin)) {
      return { status: 403, error: 'Origin not allowed' };
    }
    if (requireSessionToken) {
      const searchParams = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`).searchParams;
      const provided = request.headers['x-session-token'] || searchParams.get('token') || '';
      if (!isValidSessionToken(provided)) {
        return { status: 403, error: 'Missing or invalid session token' };
      }
    }
    return null;
  }

  /** The URL to announce: loopback host, the port, and the session token. */
  function announcedUrl(pathname = '/') {
    return `http://${LOOPBACK_HOST}:${port}${pathname}?token=${sessionToken}`;
  }

  return { sessionToken, rejectionFor, announcedUrl };
}
