/** OpenAPI success responses — app domain (branches and their user accesses). */
import type { ResponseDefinition } from '@tooling/openapi/response-map/building-blocks.js';
import { wrapSuccess } from '@tooling/openapi/response-map/building-blocks.js';
import * as schemas from '@tooling/openapi/response-map/resource-schemas.js';

const branchResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess(schemas.branchSchema, schemas.branchExample),
  example: null,
};

const branchUserAccessesResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess({ type: 'array', items: schemas.branchUserAccessSchema }, [
    schemas.branchUserAccessExample,
  ]),
  example: null,
};

export const appRouteResponses: Record<string, ResponseDefinition> = {
  // ── Branches ──
  'GET /api/v1/app/branches/my': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'array', items: schemas.branchSummarySchema }, [
      schemas.branchSummaryExample,
    ]),
    example: null,
  },
  'GET /api/v1/app/branches': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'array', items: schemas.branchSchema }, [schemas.branchExample]),
    example: null,
  },
  'GET /api/v1/app/branches/{branch_id}': branchResponse,
  'POST /api/v1/app/branches': branchResponse,
  'PATCH /api/v1/app/branches/{branch_id}': branchResponse,
  // ── Branch user accesses ──
  'GET /api/v1/app/branches/{branch_id}/user-accesses': branchUserAccessesResponse,
  'PUT /api/v1/app/branches/{branch_id}/user-accesses': branchUserAccessesResponse,
};
