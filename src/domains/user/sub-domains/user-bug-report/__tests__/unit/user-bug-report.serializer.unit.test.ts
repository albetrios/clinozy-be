import { describe, expect, it } from 'vitest';
import {
  buildReporterName,
  serializeUserBugReport,
  serializeUserBugReportForExport,
} from '@/domains/user/sub-domains/user-bug-report/user-bug-report.serializer.js';
import type { UserBugReportRow } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.types.js';

const CREATED_AT = new Date('2026-10-13T10:00:00.000Z');

function row(overrides: Partial<UserBugReportRow> = {}): UserBugReportRow {
  return {
    id: 1,
    public_id: 'bug_aaaaaaaaaaaaaaaaaaaaa',
    user_id: 42,
    reporter_name: 'Asha Rao',
    reporter_email: 'asha@example.com',
    organization_public_id: 'org_bbbbbbbbbbbbbbbbbbbbb',
    description: 'The invoice total does not update',
    input_method: 'mixed',
    page_path: '/organization/acme/billing',
    app_version: '1.13.0',
    user_agent: 'Mozilla/5.0',
    created_at: CREATED_AT,
    ...overrides,
  };
}

describe('user-bug-report.serializer', () => {
  it('shapes the reply with the public ids and leaves the email and user agent out', () => {
    expect(
      serializeUserBugReport({ row: row(), user_public_id: 'usr_ccccccccccccccccccccc' }),
    ).toEqual({
      id: 'bug_aaaaaaaaaaaaaaaaaaaaa',
      description: 'The invoice total does not update',
      input_method: 'mixed',
      page_path: '/organization/acme/billing',
      app_version: '1.13.0',
      user_id: 'usr_ccccccccccccccccccccc',
      reporter_name: 'Asha Rao',
      organization_id: 'org_bbbbbbbbbbbbbbbbbbbbb',
      created_at: CREATED_AT.toISOString(),
    });
  });

  it('shapes the export entry with only what the person wrote and where', () => {
    expect(serializeUserBugReportForExport(row())).toEqual({
      description: 'The invoice total does not update',
      input_method: 'mixed',
      page_path: '/organization/acme/billing',
      app_version: '1.13.0',
      created_at: CREATED_AT.toISOString(),
    });
  });

  it('joins the names, drops a missing half, and is null when there is none (BR5)', () => {
    expect(buildReporterName({ first_name: 'Asha', last_name: 'Rao' })).toBe('Asha Rao');
    expect(buildReporterName({ first_name: ' Asha ', last_name: null })).toBe('Asha');
    expect(buildReporterName({ first_name: null, last_name: 'Rao' })).toBe('Rao');
    expect(buildReporterName({ first_name: '  ', last_name: null })).toBeNull();
    expect(buildReporterName({ first_name: null, last_name: null })).toBeNull();
  });
});
