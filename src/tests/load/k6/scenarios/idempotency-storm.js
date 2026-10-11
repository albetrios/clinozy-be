import { THRESHOLDS } from '../helpers/config.js';
import { setup as roleSetup, tenancyRoleWriteOps } from './tenancy-role-write.js';

/**
 * Concurrent owned-role journeys reuse the strict duplicate-create/replay assertions.
 * Every journey must persist one role, read its effects, and clean it up. Rejected
 * billing setup (422) cannot masquerade as successful idempotency coverage.
 */
export const options = {
  scenarios: {
    storm: { executor: 'shared-iterations', vus: 5, iterations: 20, maxDuration: '2m' },
  },
  thresholds: { ...THRESHOLDS, checks: ['rate==1'], role_journeys_completed: ['count==20'] },
};
export function setup() {
  roleSetup();
}
export default function idempotencyStorm() {
  tenancyRoleWriteOps();
}
