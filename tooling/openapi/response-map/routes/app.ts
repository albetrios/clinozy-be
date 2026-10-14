/** OpenAPI success responses — app domain (branches and their user accesses). */
import type { ResponseDefinition } from '@tooling/openapi/response-map/building-blocks.js';
import {
  wrapPaginated,
  wrapSuccess,
  wrapUncountedPaginated,
} from '@tooling/openapi/response-map/building-blocks.js';
import * as schemas from '@tooling/openapi/response-map/resource-schemas.js';

const branchResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess(schemas.branchSchema, schemas.branchExample),
  example: null,
};

const onboardingSetupResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess(schemas.onboardingSetupSchema, schemas.onboardingSetupExample),
  example: null,
};

const contactResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess(schemas.contactSchema, schemas.contactExample),
  example: null,
};

const contactMembersResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess({ type: 'array', items: schemas.contactMemberSchema }, [
    schemas.contactMemberExample,
  ]),
  example: null,
};

const contactActivityResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess(schemas.contactActivitySchema, schemas.contactActivityExample),
  example: null,
};

const contactMessageTemplateResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess(schemas.contactMessageTemplateSchema, schemas.contactMessageTemplateExample),
  example: null,
};

const branchMembersResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess({ type: 'array', items: schemas.branchMemberSchema }, [
    schemas.branchMemberExample,
  ]),
  example: null,
};

const membershipPreferencesResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess(schemas.membershipPreferencesSchema, schemas.membershipPreferencesExample),
  example: null,
};

const membershipSavedViewResponse: ResponseDefinition = {
  statusCode: 200,
  schema: wrapSuccess(schemas.membershipSavedViewSchema, schemas.membershipSavedViewExample),
  example: null,
};

/** Every rule with its switches (10.B.6) — a rule never saved answers `id` null, on, by hand. */
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
  // ── Onboarding setup (feat-clinic-setup) ──
  'GET /api/v1/app/onboarding-setup': onboardingSetupResponse,
  'PATCH /api/v1/app/onboarding-setup': onboardingSetupResponse,
  'POST /api/v1/app/onboarding-setup/complete': onboardingSetupResponse,
  // ── Memberships (the team picker and member directory) ──
  // Neither directory counts: no `meta.pagination.estimated_total` (SHELL-M2)
  'GET /api/v1/app/memberships': {
    statusCode: 200,
    schema: wrapUncountedPaginated(schemas.appMembershipSchema, [schemas.appMembershipExample]),
    example: null,
  },
  // ── Medical store: who owes on sales (MD25 — one answer, no cursor) ──
  'GET /api/v1/app/medical-sales/dues': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'array', items: schemas.medicalSaleDuesSchema }, [
      schemas.medicalSaleDuesExample,
    ]),
    example: null,
  },
  // ── Roles (the role directory, launch D81 (4)) ──
  'GET /api/v1/app/roles': {
    statusCode: 200,
    schema: wrapUncountedPaginated(schemas.appRoleSchema, [schemas.appRoleExample]),
    example: null,
  },
  // ── The member's own preferences (launch §2.F) ──
  'GET /api/v1/app/memberships/me/preferences': membershipPreferencesResponse,
  'PATCH /api/v1/app/memberships/me/preferences': membershipPreferencesResponse,
  // ── The member's own saved views (launch §2.G) ──
  'GET /api/v1/app/memberships/me/saved-views': {
    statusCode: 200,
    schema: wrapPaginated(schemas.membershipSavedViewSchema, [schemas.membershipSavedViewExample]),
    example: null,
  },
  'POST /api/v1/app/memberships/me/saved-views': membershipSavedViewResponse,
  'GET /api/v1/app/memberships/me/saved-views/{membership_saved_view_id}':
    membershipSavedViewResponse,
  'PATCH /api/v1/app/memberships/me/saved-views/{membership_saved_view_id}':
    membershipSavedViewResponse,
  'DELETE /api/v1/app/memberships/me/saved-views/{membership_saved_view_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  // ── Task rules (the whole list) ──
  'GET /api/v1/app/task-rule-settings': taskRulesResponse,
  'PUT /api/v1/app/task-rule-settings': taskRulesResponse,
  // ── Contacts (launch #129, routes-final 4.A–4.B) ──
  'GET /api/v1/app/contacts': {
    statusCode: 200,
    schema: wrapPaginated(schemas.contactSchema, [schemas.contactExample]),
    example: null,
  },
  'POST /api/v1/app/contacts': contactResponse,
  'GET /api/v1/app/contacts/{contact_id}': contactResponse,
  'PATCH /api/v1/app/contacts/{contact_id}': contactResponse,
  'DELETE /api/v1/app/contacts/{contact_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/contacts/{contact_id}/restore': contactResponse,
  'GET /api/v1/app/contacts/{contact_id}/preview': {
    statusCode: 200,
    schema: wrapSuccess(schemas.contactPreviewSchema, schemas.contactPreviewExample),
    example: null,
  },
  'GET /api/v1/app/contacts/{contact_id}/members': contactMembersResponse,
  'PUT /api/v1/app/contacts/{contact_id}/members': contactMembersResponse,
  // ── Contact activity and message templates (launch #130, routes-final 4.C–4.D) ──
  'GET /api/v1/app/contacts/{contact_id}/activities': {
    statusCode: 200,
    schema: wrapPaginated(schemas.contactActivitySchema, [schemas.contactActivityExample]),
    example: null,
  },
  'POST /api/v1/app/contacts/{contact_id}/activities/send-message': contactActivityResponse,
  'POST /api/v1/app/contacts/{contact_id}/activities/log-call': contactActivityResponse,
  'POST /api/v1/app/contacts/{contact_id}/activities/add-note': contactActivityResponse,
  'GET /api/v1/app/contacts/{contact_id}/activities/{contact_activity_id}': contactActivityResponse,
  'POST /api/v1/app/contacts/{contact_id}/activities/{contact_activity_id}/resend':
    contactActivityResponse,
  'POST /api/v1/app/contact-activities/message-batches': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'array', items: schemas.contactActivitySchema }, [
      schemas.contactActivityExample,
    ]),
    example: null,
  },
  'GET /api/v1/app/contact-message-templates': {
    statusCode: 200,
    schema: wrapPaginated(schemas.contactMessageTemplateSchema, [
      schemas.contactMessageTemplateExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/contact-message-templates': contactMessageTemplateResponse,
  'GET /api/v1/app/contact-message-templates/{contact_message_template_id}':
    contactMessageTemplateResponse,
  'PATCH /api/v1/app/contact-message-templates/{contact_message_template_id}':
    contactMessageTemplateResponse,
  'DELETE /api/v1/app/contact-message-templates/{contact_message_template_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/contact-message-templates/{contact_message_template_id}/restore':
    contactMessageTemplateResponse,
  // ── Branch user accesses ──
  'GET /api/v1/app/branches/{branch_id}/members': branchMembersResponse,
  'PUT /api/v1/app/branches/{branch_id}/members': branchMembersResponse,
};
