import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebauthnService } from '@/domains/auth/sub-domains/auth-webauthn/webauthn.service.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { WebauthnCredentialRepository } from '@/domains/auth/sub-domains/auth-webauthn/webauthn-credential.repository.js';
import { ValidationError } from '@/shared/errors/index.js';

vi.mock('@/domains/auth/sub-domains/auth-webauthn/webauthn-challenge.js', () => ({
  createWebauthnChallenge: vi.fn().mockResolvedValue('challenge-token'),
}));

vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(
    async (options: { rpID: string; allowCredentials?: { id: string }[] }) => ({
      challenge: 'challenge',
      rpId: options.rpID,
      ...(options.allowCredentials ? { allowCredentials: options.allowCredentials } : {}),
    }),
  ),
}));

import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createWebauthnChallenge } from '@/domains/auth/sub-domains/auth-webauthn/webauthn-challenge.js';

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
    withAppDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
  };
});

describe('WebauthnService.generateAuthenticationOptions', () => {
  const userService = {
    findByEmail: vi.fn(),
  } as unknown as UserService;

  const credentialRepository = {
    listActiveByUserId: vi.fn(),
  } as unknown as WebauthnCredentialRepository;

  const service = new WebauthnService(
    userService,
    {} as never,
    credentialRepository,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing email with ValidationError before querying any account', async () => {
    await expect(service.generateAuthenticationOptions(undefined)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(userService.findByEmail).not.toHaveBeenCalled();
    expect(credentialRepository.listActiveByUserId).not.toHaveBeenCalled();
  });

  const KNOWN_USER = {
    id: 7,
    public_id: 'abcdefghijklmnopqrstu',
    email: 'has-passkey@example.com',
  };

  function challengeOwnerOfLastCall(): string {
    const calls = vi.mocked(createWebauthnChallenge).mock.calls;
    return calls[calls.length - 1]![0].userPublicId;
  }

  it('sends no credential list for an unknown email, and still runs the lookup to equalize timing (route-audit D1)', async () => {
    vi.mocked(userService.findByEmail).mockResolvedValue(null);
    vi.mocked(credentialRepository.listActiveByUserId).mockResolvedValue([] as never);

    const result = await service.generateAuthenticationOptions({ email: 'missing@example.com' });

    expect(result.challenge_token).toBe('challenge-token');
    expect(result.options).not.toHaveProperty('allowCredentials');
    // D1: the lookup runs even for an unknown email (synthetic context, user_id 0) so the DB
    // round-trip — and thus response latency — matches the known-email path.
    expect(credentialRepository.listActiveByUserId).toHaveBeenCalledWith(0);
    expect(challengeOwnerOfLastCall()).toMatch(/^decoy:/);
  });

  it('binds a known email without passkeys to a non-resolvable decoy owner', async () => {
    vi.mocked(userService.findByEmail).mockResolvedValue({ ...KNOWN_USER, id: 1 } as never);
    vi.mocked(credentialRepository.listActiveByUserId).mockResolvedValue([]);

    const result = await service.generateAuthenticationOptions({ email: 'user@example.com' });

    expect(result.options).not.toHaveProperty('allowCredentials');
    expect(challengeOwnerOfLastCall()).toMatch(/^decoy:/);
  });

  it('binds a known email with passkeys to its account — without listing its credentials', async () => {
    vi.mocked(userService.findByEmail).mockResolvedValue(KNOWN_USER as never);
    vi.mocked(credentialRepository.listActiveByUserId).mockResolvedValue([
      { credential_id: 'real-credential-a', transports: ['usb', 'nfc'] },
      { credential_id: 'real-credential-b', transports: ['hybrid'] },
    ] as never);

    const result = await service.generateAuthenticationOptions({ email: KNOWN_USER.email });

    expect(result.options).not.toHaveProperty('allowCredentials');
    expect(challengeOwnerOfLastCall()).toBe(KNOWN_USER.public_id);
  });

  it('builds the options identically for an unknown email and a multi-passkey account (no enumeration)', async () => {
    vi.mocked(userService.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(credentialRepository.listActiveByUserId).mockResolvedValueOnce([] as never);
    const unknown = await service.generateAuthenticationOptions({ email: 'missing@example.com' });

    vi.mocked(userService.findByEmail).mockResolvedValueOnce(KNOWN_USER as never);
    vi.mocked(credentialRepository.listActiveByUserId).mockResolvedValueOnce([
      { credential_id: 'real-credential-a', transports: ['usb'] },
      { credential_id: 'real-credential-b', transports: ['internal'] },
    ] as never);
    const enrolled = await service.generateAuthenticationOptions({ email: KNOWN_USER.email });

    const [unknownCall, enrolledCall] = vi.mocked(generateAuthenticationOptions).mock.calls;
    expect(enrolledCall).toEqual(unknownCall);
    expect(Object.keys(enrolled.options).sort()).toEqual(Object.keys(unknown.options).sort());
  });
});
