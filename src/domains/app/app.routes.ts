import type { FastifyPluginAsync } from 'fastify';
import { branchesRoutes } from './sub-domains/branches/branches.routes.js';
import { branchMembersRoutes } from './sub-domains/branches/branch-members/branch-members.routes.js';
import { registerAppRecordRoutes } from './app-records.plugin.js';
import { membershipPreferencesRoutes } from './sub-domains/memberships/membership-preferences/membership-preferences.routes.js';
import { membershipSavedViewsRoutes } from './sub-domains/memberships/membership-saved-views/membership-saved-views.routes.js';
import { taskRuleSettingsRoutes } from './sub-domains/tasks/task-rule-settings/task-rule-settings.routes.js';
import { patientIdeasRoutes } from './sub-domains/patients/patient-ideas/patient-ideas.routes.js';
import { appMembershipsRoutes } from './sub-domains/memberships/memberships.routes.js';
import { contactMembersRoutes } from './sub-domains/contacts/contact-members/contact-members.routes.js';
import { contactMessagingWebhookRoutes } from './sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.routes.js';

/** Registers the app domain's routes under `/api/v1/app`. */
export const appRoutesPlugin: FastifyPluginAsync = async (app) => {
  const { appDomain } = app;
  await app.register(branchesRoutes(appDomain.branchesService));
  await app.register(branchMembersRoutes(appDomain.branchMembersService));
  await app.register(taskRuleSettingsRoutes(appDomain.taskRuleSettingsService));
  await app.register(patientIdeasRoutes(appDomain.patientIdeasService));
  await app.register(appMembershipsRoutes(appDomain.appMembershipsService));
  await app.register(membershipPreferencesRoutes(appDomain.membershipPreferencesService));
  await app.register(membershipSavedViewsRoutes(appDomain.membershipSavedViewsService));
  await app.register(contactMembersRoutes(appDomain.contactMembersService));
  // Public: the platform Meta app's webhook (signature-checked, no authentication — D77).
  await app.register(contactMessagingWebhookRoutes(appDomain.contactMessagingWebhookService));
  await registerAppRecordRoutes(app, appDomain);
};
