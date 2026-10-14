import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '@/shared/errors/index.js';
import { UserBugReportService } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.service.js';
import {
  PRINCIPAL_SCOPE,
  type UserPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // CI's unit lane has no Postgres: run the unit of work's callback directly.
    withAppDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
  };
});

const CREATED_AT = new Date('2026-10-13T10:00:00.000Z');

const scopeFor = (organizationPublicId?: string) =>
  PRINCIPAL_SCOPE.REQUEST({
    userPublicId: 'usr_ccccccccccccccccccccc',
    organizationPublicId,
  }) as UserPrincipalDatabaseScope;

describe('UserBugReportService.create', () => {
  const repository = {
    findReporterByPublicId: vi.fn(),
    create: vi.fn(),
    listForUserDataExport: vi.fn(),
  };
  const service = new UserBugReportService(repository as never);

  beforeEach(() => {
    vi.clearAllMocks();
    repository.findReporterByPublicId.mockResolvedValue({
      id: 42,
      first_name: 'Asha',
      last_name: 'Rao',
      email: 'asha@example.com',
    });
    repository.create.mockImplementation(async (insert: Record<string, unknown>) => ({
      id: 1,
      created_at: CREATED_AT,
      ...insert,
    }));
  });

  // feat-bug-report BR4: who filed it is the session's person, read from their account.
  it('stamps the reporter, the workspace and the user agent from the request, not the body', async () => {
    const result = await service.create({
      scope: scopeFor('org_bbbbbbbbbbbbbbbbbbbbb'),
      body: { description: ' Froze on save ', input_method: 'voice', page_path: '/today' },
      userAgent: 'Mozilla/5.0',
    });

    expect(repository.findReporterByPublicId).toHaveBeenCalledWith('usr_ccccccccccccccccccccc');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 42,
        reporter_name: 'Asha Rao',
        reporter_email: 'asha@example.com',
        organization_public_id: 'org_bbbbbbbbbbbbbbbbbbbbb',
        description: 'Froze on save',
        input_method: 'voice',
        page_path: '/today',
        app_version: null,
        user_agent: 'Mozilla/5.0',
      }),
    );
    expect(repository.create.mock.calls[0]?.[0].public_id).toMatch(/^bug_[a-z0-9]{21}$/);
    expect(result).toMatchObject({
      user_id: 'usr_ccccccccccccccccccccc',
      reporter_name: 'Asha Rao',
      organization_id: 'org_bbbbbbbbbbbbbbbbbbbbb',
      created_at: CREATED_AT.toISOString(),
    });
  });

  it('records no workspace when the token has none', async () => {
    await service.create({
      scope: scopeFor(),
      body: { description: 'Froze', input_method: 'typed' },
      userAgent: null,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ organization_public_id: null, user_agent: null }),
    );
  });

  it('keeps a null name when the account has none yet (BR5)', async () => {
    repository.findReporterByPublicId.mockResolvedValue({
      id: 42,
      first_name: null,
      last_name: null,
      email: 'asha@example.com',
    });

    const result = await service.create({
      scope: scopeFor(),
      body: { description: 'Froze', input_method: 'typed' },
      userAgent: null,
    });

    expect(result.reporter_name).toBeNull();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ reporter_email: 'asha@example.com' }),
    );
  });

  it('is a 404 when the account is gone, and writes nothing', async () => {
    repository.findReporterByPublicId.mockResolvedValue(null);

    await expect(
      service.create({
        scope: scopeFor(),
        body: { description: 'Froze', input_method: 'typed' },
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('validates before touching the database', async () => {
    await expect(
      service.create({ scope: scopeFor(), body: { description: '' }, userAgent: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.findReporterByPublicId).not.toHaveBeenCalled();
  });
});
