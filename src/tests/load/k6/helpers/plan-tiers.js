/**
 * The four-plan catalog every billing-provider journey covers: USD prices, no annual Free.
 * Shared by the k6 billing scenario, the loopback provider and the sandbox fixture preparation.
 */
export const PLAN_TIERS = [
  { tier: 'Free', monthly: 0, yearly: null, seats: 1 },
  { tier: 'Starter', monthly: 10, yearly: 100, seats: 5 },
  { tier: 'Growth', monthly: 30, yearly: 300, seats: 15 },
  { tier: 'Pro', monthly: 99, yearly: 990, seats: 25 },
];
