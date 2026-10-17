import type { PlanAccess, PlanAccessState } from './subscription.types.js';

/** The three {@link PlanAccessState} values of a clinic's plan access, by name (owner decision D3). */
export const PLAN_ACCESS_STATE = {
  ACTIVE: 'active',
  GRACE: 'grace',
  READ_ONLY: 'read_only',
} as const satisfies Record<string, PlanAccessState>;

/** The plan access of a clinic that may write and has no grace running. */
export const ACTIVE_PLAN_ACCESS: Readonly<PlanAccess> = Object.freeze({
  state: PLAN_ACCESS_STATE.ACTIVE,
  graceEndsAt: null,
});
