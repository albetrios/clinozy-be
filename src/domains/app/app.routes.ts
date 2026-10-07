import type { FastifyPluginAsync } from 'fastify';
import { branchesRoutes } from './sub-domains/branches/branches.routes.js';
import { branchUserAccessesRoutes } from './sub-domains/branches/branch-user-accesses/branch-user-accesses.routes.js';

/** Registers the app domain's routes under `/api/v1/app`. */
export const appRoutesPlugin: FastifyPluginAsync = async (app) => {
  const { appDomain } = app;
  await app.register(branchesRoutes(appDomain.branchesService));
  await app.register(branchUserAccessesRoutes(appDomain.branchUserAccessesService));
};
