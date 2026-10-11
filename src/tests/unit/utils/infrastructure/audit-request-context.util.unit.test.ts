import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import {
  buildAuditActorFields,
  getAuditRequestNetworkContext,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import { USER_AGENT_MAX_LENGTH } from '@/shared/utils/http/user-agent.util.js';
import type { ApiKeyAuthContext, UserAuthContext } from '@/shared/types/index.js';

describe('buildAuditActorFields', () => {
  it('attributes a user principal to actorUserPublicId', () => {
    const auth: UserAuthContext = { kind: 'user', userId: 'user-1', role: 'user' };
    expect(buildAuditActorFields(auth)).toEqual({ actorUserPublicId: 'user-1' });
  });

  it('attributes an API-key principal to actorApiKeyPublicId and never a user actor', () => {
    const auth: ApiKeyAuthContext = {
      kind: 'apiKey',
      apiKeyPublicId: 'key-1',
      apiKeyScopes: ['members:roles:manage'],
      organizationPublicId: 'org-1',
    };
    const fields = buildAuditActorFields(auth);
    expect(fields).toEqual({ actorApiKeyPublicId: 'key-1' });
    expect(fields.actorUserPublicId).toBeUndefined();
  });
});

describe('getAuditRequestNetworkContext', () => {
  const requestWith = (userAgent: string | undefined) =>
    ({
      ip: '203.0.113.7',
      headers: userAgent === undefined ? {} : { 'user-agent': userAgent },
    }) as unknown as FastifyRequest;

  it('cuts a client-controlled User-Agent to the column limit', () => {
    // Unbounded, an unauthenticated flood of failed logins bloated audit.outbox and audit.logs.
    const context = getAuditRequestNetworkContext(requestWith('x'.repeat(10_000)));
    expect(context.user_agent).toHaveLength(USER_AGENT_MAX_LENGTH);
    expect(context.ip_address).toBe('203.0.113.7');
  });

  it('keeps a normal User-Agent and returns null without one', () => {
    expect(getAuditRequestNetworkContext(requestWith('Mozilla/5.0')).user_agent).toBe(
      'Mozilla/5.0',
    );
    expect(getAuditRequestNetworkContext(requestWith(undefined)).user_agent).toBeNull();
  });
});
