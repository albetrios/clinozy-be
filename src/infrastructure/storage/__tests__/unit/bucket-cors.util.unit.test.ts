import { describe, expect, it } from 'vitest';
import {
  UPLOAD_BUCKET_CORS_ALLOWED_HEADERS,
  buildCorsPreflightHeaders,
  buildUploadBucketCorsRules,
  corsPreflightAdmits,
} from '@/infrastructure/storage/bucket-cors.util.js';
import { ConfigurationError } from '@/shared/errors/index.js';

describe('buildUploadBucketCorsRules', () => {
  it('admits the web app origins for the presigned POST, the PUT fallback and the reads', () => {
    expect(buildUploadBucketCorsRules(['http://localhost:5173', 'https://app.example'])).toEqual([
      {
        AllowedOrigins: ['http://localhost:5173', 'https://app.example'],
        // POST is the default upload (UPLOAD_USE_PRESIGNED_POST, required in production) — the
        // development bucket admitted PUT/GET/HEAD only, so every browser upload was refused.
        AllowedMethods: ['POST', 'PUT', 'GET', 'HEAD'],
        AllowedHeaders: ['content-type', 'x-amz-server-side-encryption'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      },
    ]);
  });

  it('refuses to build a rule that admits nobody', () => {
    expect(() => buildUploadBucketCorsRules([])).toThrow(ConfigurationError);
  });
});

describe('buildCorsPreflightHeaders', () => {
  it('asks for the signed headers before a PUT', () => {
    expect(buildCorsPreflightHeaders({ origin: 'http://localhost:5173', method: 'PUT' })).toEqual({
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': UPLOAD_BUCKET_CORS_ALLOWED_HEADERS.join(','),
    });
  });

  it('asks for no headers before a form POST', () => {
    expect(buildCorsPreflightHeaders({ origin: 'http://localhost:5173', method: 'POST' })).toEqual({
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
    });
  });
});

describe('corsPreflightAdmits', () => {
  const admitted = {
    origin: 'http://localhost:5173',
    method: 'POST' as const,
    status: 200,
    allowOrigin: 'http://localhost:5173',
    allowMethods: 'POST, PUT, GET, HEAD',
  };

  it('admits a 2xx answer that echoes the origin and lists the method', () => {
    expect(corsPreflightAdmits(admitted)).toBe(true);
    expect(corsPreflightAdmits({ ...admitted, allowOrigin: '*' })).toBe(true);
  });

  it('refuses S3’s 403 for an origin no rule matches', () => {
    expect(
      corsPreflightAdmits({ ...admitted, status: 403, allowOrigin: null, allowMethods: null }),
    ).toBe(false);
  });

  it('refuses an answer for another origin', () => {
    expect(corsPreflightAdmits({ ...admitted, allowOrigin: 'http://localhost:3000' })).toBe(false);
  });

  it('refuses a method the rule does not list — the development bucket’s POST', () => {
    expect(corsPreflightAdmits({ ...admitted, allowMethods: 'PUT, GET, HEAD' })).toBe(false);
  });
});
