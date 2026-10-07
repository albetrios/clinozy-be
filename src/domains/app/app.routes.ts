import type { FastifyPluginAsync } from 'fastify';
import { branchesRoutes } from './sub-domains/branches/branches.routes.js';
import { branchUserAccessesRoutes } from './sub-domains/branches/branch-user-accesses/branch-user-accesses.routes.js';
import { registerAppRecordRoutes } from './app-records.plugin.js';
import { userPreferencesRoutes } from './sub-domains/user-preferences/user-preferences.routes.js';
import { taskRuleSettingsRoutes } from './sub-domains/task-rule-settings/task-rule-settings.routes.js';
import { appUsersRoutes } from './sub-domains/users/users.routes.js';
import { searchesRoutes } from './sub-domains/searches/searches.routes.js';
import { contactsRoutes } from './sub-domains/contacts/contacts.routes.js';

/** Registers the app domain's routes under `/api/v1/app`. */
export const appRoutesPlugin: FastifyPluginAsync = async (app) => {
  const { appDomain } = app;
  await app.register(branchesRoutes(appDomain.branchesService));
  await app.register(branchUserAccessesRoutes(appDomain.branchUserAccessesService));
  await app.register(userPreferencesRoutes(appDomain.userPreferencesService));
  await app.register(taskRuleSettingsRoutes(appDomain.taskRuleSettingsService));
  await app.register(appUsersRoutes(appDomain.appUsersService));
  await app.register(searchesRoutes(appDomain.searchesService));
  await app.register(contactsRoutes(appDomain.contactsService));
  await registerAppRecordRoutes(app, appDomain);
};
