/**
 * Canonical MCP tools and resources for the API.
 * Used by the MCP server and OpenAPI generation (Scalar /reference UI).
 */
import { z } from 'zod';
import {
  MCP_OPENAPI_RESOURCE_URI,
  MCP_ROUTES_RESOURCE_URI,
  PROJECT_DISPLAY_NAME,
  PROJECT_SLUG,
} from '@/shared/constants/project-identity.constants.js';

export { MCP_OPENAPI_RESOURCE_URI, MCP_ROUTES_RESOURCE_URI };

/** MCP resource URI for the hand-written client integration / auth-flow guide ({@link MCP_CLIENT_GUIDE}). */
export const MCP_CLIENT_GUIDE_RESOURCE_URI = `${PROJECT_SLUG}://client-guide`;

/**
 * Zod input schema for the `call_api` MCP tool. Forwards HTTP method, path (must start
 * with `/api/v1/`), JSON body, and optional auth headers — clients use this to invoke
 * any backend endpoint through the MCP transport.
 */
export const callApiInputSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).describe('HTTP method'),
  path: z.string().describe('API path (must start with /api/v1/)'),
  body: z.record(z.string(), z.unknown()).optional().describe('Request body for POST/PATCH/PUT'),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      'Optional headers (e.g. Authorization: Bearer <token>). The active organization comes ' +
        `from the token's signed organization claim — not a header. Read ${MCP_CLIENT_GUIDE_RESOURCE_URI} for the auth flow.`,
    ),
});

/** Options for {@link evaluateCallApiPolicy}: the requested call plus the deployment's MCP config. */
export interface CallApiPolicyOptions {
  /** HTTP method the `call_api` tool was asked to invoke. */
  method: string;
  /** API path the tool was asked to invoke. */
  path: string;
  /** `MCP_CALL_API_ALLOW_MUTATIONS` — when false, only GET is permitted. */
  allowMutations: boolean;
  /** `MCP_CALL_API_ALLOWED_PATH_PREFIXES` — when non-empty, the path must match one. */
  allowedPathPrefixes: readonly string[];
}

/**
 * Outcome of {@link evaluateCallApiPolicy}: allowed with the normalised `url` the sub-request
 * must use, or rejected with a client-safe message.
 */
export type CallApiPolicyResult =
  | { allowed: true; url: string }
  | { allowed: false; message: string };

/** Origin the `call_api` path is resolved against; only compared, never fetched. */
const CALL_API_PATH_BASE = 'http://call-api.invalid';

/**
 * A `.` or `..` path segment, raw or percent-encoded (`%2e`, any case), between separators or at
 * the end of the path part. `new URL()` and Fastify's inject resolve both forms, so `/api/v1/../admin` and
 * `/api/v1/%2e%2e/admin` would leave the checked prefix after the check passed.
 */
const DOT_SEGMENT_PATTERN = /(?:^|\/)(?:\.|%2e){1,2}(?=$|\/)/i;

/**
 * Whitespace (URL parsing drops tabs and newlines, so `.<tab>.` becomes `..`), a backslash, or a
 * percent-encoded separator (`%2f`, `%5c`): no API path needs one.
 */
const UNSAFE_PATH_CHARACTER_PATTERN = /[\s\\]|%2f|%5c/i;

/**
 * The path `call_api` may inject: same-origin, no dot segment, no unsafe character, resolved to
 * `pathname + search` — or `null` when the path is refused.
 */
function normaliseCallApiPath(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  // The query and fragment never move the route, so only the path part is screened.
  const pathPart = path.split(/[?#]/, 1)[0] ?? '';
  if (DOT_SEGMENT_PATTERN.test(pathPart) || UNSAFE_PATH_CHARACTER_PATTERN.test(pathPart)) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(path, CALL_API_PATH_BASE);
  } catch {
    return null;
  }
  if (parsed.origin !== CALL_API_PATH_BASE) return null;
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * R14: decides whether a `call_api` invocation is permitted, consolidating every gate the
 * admin-authority in-process proxy enforces — the `/api/v1/` (+ health) path gate, the
 * read-only-by-default method restriction, and the optional operator path-prefix allowlist.
 *
 * @remarks
 * - **Algorithm:** normalise the path (reject a dot segment — raw or `%2e` — a backslash, an
 *   encoded separator, or a different origin; resolve with `new URL()`) → path-prefix gate on the
 *   normalised path → method gate (GET unless `allowMutations`) → optional allowlist gate on the
 *   normalised path; returns `{ allowed: true, url }` only when all pass. The caller injects `url`,
 *   so the path checked is the path called (C-3).
 * - **Failure modes:** none thrown — every rejection returns a client-safe `message` string.
 * - **Side effects:** pure; reads no globals (config is passed in), so it is fully unit-testable.
 * - **Notes:** the message is safe to surface to the (admin) MCP client; it carries no internals.
 */
export function evaluateCallApiPolicy(options: CallApiPolicyOptions): CallApiPolicyResult {
  const { method, allowMutations, allowedPathPrefixes } = options;
  const url = normaliseCallApiPath(options.path);
  if (url === null) {
    return {
      allowed: false,
      message: 'Path must be an absolute API path without dot segments or encoded separators.',
    };
  }
  const pathname = url.split('?', 1)[0] ?? url;
  if (
    !(
      pathname.startsWith('/api/v1/') ||
      pathname.startsWith('/livez') ||
      pathname.startsWith('/readyz')
    )
  ) {
    return { allowed: false, message: 'Path must start with /api/v1/, /livez, or /readyz' };
  }
  if (method !== 'GET' && !allowMutations) {
    return {
      allowed: false,
      message: `Method ${method} is not permitted: call_api is read-only unless MCP_CALL_API_ALLOW_MUTATIONS is enabled.`,
    };
  }
  if (
    allowedPathPrefixes.length > 0 &&
    !allowedPathPrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return {
      allowed: false,
      message: 'Path is not in the MCP call_api allowlist for this deployment.',
    };
  }
  return { allowed: true, url };
}

/** Static descriptor for an MCP resource — used to register resources on the server and to render the OpenAPI page. */
export type McpResourceDefinition = {
  name: string;
  uri: string;
  title: string;
  description: string;
  mimeType: string;
};

/** Static descriptor for an MCP tool, including the Zod schema validating tool input arguments. */
export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodType;
};

/** Canonical resource catalog exposed via MCP (OpenAPI spec + route catalog). */
export const MCP_RESOURCES: readonly McpResourceDefinition[] = [
  {
    name: `${PROJECT_SLUG}-openapi`,
    uri: MCP_OPENAPI_RESOURCE_URI,
    title: `${PROJECT_DISPLAY_NAME} OpenAPI spec`,
    description:
      'OpenAPI 3.0 spec (paths, schemas, request/response). Use this to discover and validate API calls. Generate with pnpm docs:generate.',
    mimeType: 'application/json',
  },
  {
    name: `${PROJECT_SLUG}-routes`,
    uri: MCP_ROUTES_RESOURCE_URI,
    title: `${PROJECT_DISPLAY_NAME} API routes`,
    description: `List of all API routes (method, path, access). Use with ${MCP_OPENAPI_RESOURCE_URI} to discover endpoints before calling call_api.`,
    mimeType: 'text/plain',
  },
  {
    name: `${PROJECT_SLUG}-client-guide`,
    uri: MCP_CLIENT_GUIDE_RESOURCE_URI,
    title: `${PROJECT_DISPLAY_NAME} client integration guide`,
    description:
      'How a frontend/client should authenticate (login, refresh, MFA), carry the active organization (the signed organization JWT claim — not a path or header), switch organizations, and call the flat organization-scoped routes. Read this first when wiring up auth or any organization-scoped call.',
    mimeType: 'text/markdown',
  },
] as const;

/** Canonical tool catalog exposed via MCP (currently just the `call_api` proxy). */
export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'call_api',
    title: `Call ${PROJECT_DISPLAY_NAME} API`,
    description: `Call any ${PROJECT_DISPLAY_NAME} REST API endpoint. Path must start with /api/v1/. Pass Authorization: Bearer <token> for authenticated calls; the active organization comes from the token's signed organization claim (switch via POST /api/v1/auth/switch-to-organization or /auth/switch-to-personal), NOT a header. Read ${MCP_CLIENT_GUIDE_RESOURCE_URI} for the auth flow, and ${MCP_OPENAPI_RESOURCE_URI} / ${MCP_ROUTES_RESOURCE_URI} to discover endpoints.`,
    inputSchema: callApiInputSchema,
  },
] as const;
