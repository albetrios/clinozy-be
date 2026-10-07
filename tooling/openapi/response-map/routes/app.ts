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

/** The whole task rule list — saved settings, or the default (id null) per rule. */
const taskRulesResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess({ type: 'array', items: schemas.taskRuleSettingsRecordSchema }, [
    schemas.taskRuleSettingsRecordExample,
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
  // ── Preferences (singleton) ──
  'GET /api/v1/app/user-preferences': {
    statusCode: 200,
    schema: wrapSuccess(schemas.userPreferencesRecordSchema, schemas.userPreferencesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/user-preferences': {
    statusCode: 200,
    schema: wrapSuccess(schemas.userPreferencesRecordSchema, schemas.userPreferencesRecordExample),
    example: null,
  },
  // ── Users (the team, filtered by role and branch) ──
  'GET /api/v1/app/users': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'array', items: schemas.appUserSchema }, [schemas.appUserExample]),
    example: null,
  },
  // ── Task rules (the whole list) ──
  'GET /api/v1/app/task-rule-settings': taskRulesResponse,
  'PUT /api/v1/app/task-rule-settings': taskRulesResponse,
  'GET /api/v1/app/searches': {
    statusCode: 200,
    schema: wrapSuccess(schemas.searchSchema, schemas.searchExample),
    example: null,
  },
  'GET /api/v1/app/contacts': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'array', items: schemas.contactSchema }, [schemas.contactExample]),
    example: null,
  },
  'GET /api/v1/app/contacts/{contact_id}/preview': {
    statusCode: 200,
    schema: wrapSuccess(schemas.contactPreviewSchema, schemas.contactPreviewExample),
    example: null,
  },
  // ── Branch user accesses ──
  'GET /api/v1/app/branches/{branch_id}/user-accesses': branchUserAccessesResponse,
  'PUT /api/v1/app/branches/{branch_id}/user-accesses': branchUserAccessesResponse,
};
