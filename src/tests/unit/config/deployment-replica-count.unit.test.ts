import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  DEPLOYMENT_API_REPLICA_COUNT: undefined as number | undefined,
  DEPLOYMENT_TOTAL_REPLICA_COUNT: undefined as number | undefined,
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: mockEnv,
}));

import { resolveApiReplicaCount } from '@/shared/config/deployment-replica-count.js';

describe('resolveApiReplicaCount', () => {
  beforeEach(() => {
    mockEnv.DEPLOYMENT_API_REPLICA_COUNT = undefined;
    mockEnv.DEPLOYMENT_TOTAL_REPLICA_COUNT = undefined;
  });

  it('prefers the API replica count over the deployment total', () => {
    mockEnv.DEPLOYMENT_API_REPLICA_COUNT = 3;
    mockEnv.DEPLOYMENT_TOTAL_REPLICA_COUNT = 9;
    expect(resolveApiReplicaCount()).toBe(3);
  });

  it('falls back to the deployment total when the API count is unset', () => {
    mockEnv.DEPLOYMENT_TOTAL_REPLICA_COUNT = 4;
    expect(resolveApiReplicaCount()).toBe(4);
  });

  it('falls back to one process when neither count is set', () => {
    expect(resolveApiReplicaCount()).toBe(1);
  });
});
