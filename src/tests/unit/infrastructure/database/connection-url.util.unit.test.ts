import { describe, expect, it } from 'vitest';
import {
  isLocalDatabaseUrl,
  isNeonPoolerConnection,
  isStrictDatabaseTlsVerification,
  parseSslMode,
  resolveDatabaseSsl,
  withoutSslQueryParameters,
} from '@/infrastructure/database/utils/connection-url.util.js';

describe('connection-url.util', () => {
  describe('parseSslMode', () => {
    it('extracts and lowercases the sslmode parameter', () => {
      expect(parseSslMode('postgresql://u:p@host/db?sslmode=VERIFY-FULL')).toBe('verify-full');
    });

    it('returns null when sslmode is absent', () => {
      expect(parseSslMode('postgresql://u:p@host/db')).toBeNull();
    });
  });

  describe('isNeonPoolerConnection', () => {
    it('detects -pooler hostnames and pgbouncer=true', () => {
      expect(
        isNeonPoolerConnection('postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/db'),
      ).toBe(true);
      expect(isNeonPoolerConnection('postgresql://u:p@host/db?pgbouncer=true')).toBe(true);
    });

    it('returns false for a direct host', () => {
      expect(isNeonPoolerConnection('postgresql://u:p@host:5432/db?sslmode=verify-full')).toBe(
        false,
      );
    });
  });

  describe('isStrictDatabaseTlsVerification', () => {
    it('is strict for verify-ca and verify-full', () => {
      expect(
        isStrictDatabaseTlsVerification({ databaseUrl: 'postgresql://h/db?sslmode=verify-ca' }),
      ).toBe(true);
      expect(
        isStrictDatabaseTlsVerification({ databaseUrl: 'postgresql://h/db?sslmode=verify-full' }),
      ).toBe(true);
    });

    it('is NOT strict for sslmode=require (encrypted but unverified)', () => {
      expect(
        isStrictDatabaseTlsVerification({ databaseUrl: 'postgresql://h/db?sslmode=require' }),
      ).toBe(false);
    });

    it('is strict when DATABASE_SSL_REJECT_UNAUTHORIZED override is true', () => {
      expect(
        isStrictDatabaseTlsVerification({
          databaseUrl: 'postgresql://h/db?sslmode=require',
          rejectUnauthorizedOverride: true,
        }),
      ).toBe(true);
    });

    it('is NOT strict with no sslmode and no override', () => {
      expect(isStrictDatabaseTlsVerification({ databaseUrl: 'postgresql://h/db' })).toBe(false);
    });
  });

  describe('resolveDatabaseSsl', () => {
    it('encrypts without verifying for sslmode=require (a self-signed managed proxy)', () => {
      const ssl = resolveDatabaseSsl({
        databaseUrl: 'postgresql://h/db?sslmode=require',
        sslEnabledByDefault: false,
      });
      expect(ssl).toBeTypeOf('object');
      expect((ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(false);
    });

    it('verifies for verify-full, and for require when the override is true', () => {
      expect(
        resolveDatabaseSsl({
          databaseUrl: 'postgresql://h/db?sslmode=verify-full',
          sslEnabledByDefault: false,
        }),
      ).toEqual({ rejectUnauthorized: true });
      expect(
        resolveDatabaseSsl({
          databaseUrl: 'postgresql://h/db?sslmode=require',
          sslEnabledByDefault: false,
          rejectUnauthorizedOverride: true,
        }),
      ).toEqual({ rejectUnauthorized: true });
    });

    it('turns TLS off for sslmode=disable even when it is on by default', () => {
      expect(
        resolveDatabaseSsl({
          databaseUrl: 'postgresql://h/db?sslmode=disable',
          sslEnabledByDefault: true,
        }),
      ).toBe(false);
    });

    it('follows the default when the URL names no sslmode', () => {
      expect(
        resolveDatabaseSsl({ databaseUrl: 'postgresql://h/db', sslEnabledByDefault: false }),
      ).toBe(false);
      const ssl = resolveDatabaseSsl({
        databaseUrl: 'postgresql://h/db',
        sslEnabledByDefault: true,
      });
      expect(ssl).toBeTypeOf('object');
      expect((ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(false);
    });
  });

  describe('withoutSslQueryParameters', () => {
    it('drops every TLS parameter and keeps the rest of the URL', () => {
      expect(
        withoutSslQueryParameters(
          'postgresql://u:p@h:5432/db?sslmode=require&sslrootcert=/ca.pem&application_name=api&ssl=true',
        ),
      ).toBe('postgresql://u:p@h:5432/db?application_name=api');
    });

    it('returns an unparseable URL unchanged, so the driver reports it', () => {
      expect(withoutSslQueryParameters('not a url')).toBe('not a url');
    });
  });

  describe('isLocalDatabaseUrl', () => {
    it('recognises every loopback host, IPv6 in brackets included', () => {
      expect(isLocalDatabaseUrl('postgresql://u:p@localhost:5432/db')).toBe(true);
      expect(isLocalDatabaseUrl('postgresql://u:p@127.0.0.1:5432/db')).toBe(true);
      expect(isLocalDatabaseUrl('postgresql://u:p@[::1]:5432/db')).toBe(true);
      expect(isLocalDatabaseUrl('postgres://localhost/db')).toBe(true);
    });

    it('treats remote hosts, missing and unparseable values as not local', () => {
      expect(isLocalDatabaseUrl('postgresql://u:p@db.example.test:5432/db')).toBe(false);
      expect(isLocalDatabaseUrl('postgresql://u:p@host.docker.internal:5432/db')).toBe(false);
      expect(isLocalDatabaseUrl(undefined)).toBe(false);
      expect(isLocalDatabaseUrl('')).toBe(false);
      expect(isLocalDatabaseUrl('not a url')).toBe(false);
    });
  });
});
