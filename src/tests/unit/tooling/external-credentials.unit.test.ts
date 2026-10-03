import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import {
  EXTERNAL_CREDENTIALS,
  fillExternalCredentials,
} from '@tooling/dev/external-credentials.js';

const EXAMPLE = [
  'STRIPE_SECRET_KEY=sk_test_xxx',
  'STRIPE_WEBHOOK_SECRET=whsec_xxx',
  'RESEND_API_KEY=re_xxx',
  'EMAIL_FROM_ADDRESS=noreply@example.com',
  'S3_BUCKET=my-bucket',
  'S3_REGION=us-east-1',
  'S3_ACCESS_KEY_ID=xxx',
  'S3_SECRET_ACCESS_KEY=xxx',
  'POSTHOG_KEY=phc_...',
  'POSTHOG_HOST=https://us.i.posthog.com',
  'LOG_LEVEL=debug',
  '',
].join('\n');

const ALL_KEYS = EXTERNAL_CREDENTIALS.map((credential) => credential.key);
const REPORTED_KEYS = EXTERNAL_CREDENTIALS.filter((credential) => credential.reportMissing).map(
  (credential) => credential.key,
);

function file(label: string, content: string) {
  return { label, values: dotenv.parse(content) };
}

describe('setup:local — third-party API keys for .env.local', () => {
  it('copies every key still on its placeholder from the env file and leaves other lines alone', () => {
    const source = file(
      'env file',
      [
        'STRIPE_SECRET_KEY=stripe-key-from-file',
        'STRIPE_WEBHOOK_SECRET=webhook-secret-from-file',
        'RESEND_API_KEY=re_realResendKey',
        'EMAIL_FROM_ADDRESS="Example Sender <no-reply@mail.example.test>"',
        'S3_BUCKET=clinozy-dev-uploads',
        'S3_REGION=ap-south-1',
        'S3_ACCESS_KEY_ID=AKIAREALKEY',
        'S3_SECRET_ACCESS_KEY=real/secret+key=',
        'POSTHOG_KEY=phc_realProjectKey',
        'POSTHOG_HOST=https://eu.i.posthog.com',
        'OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.collector.test',
        'OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer collector-token',
        'LOG_LEVEL=info',
      ].join('\n'),
    );

    const fill = fillExternalCredentials({ local: EXAMPLE, example: EXAMPLE, sources: [source] });

    expect(fill.copied).toEqual(ALL_KEYS.map((key) => ({ key, source: 'env file' })));
    expect(fill.missing).toEqual([]);
    const result = dotenv.parse(fill.content);
    expect(result.STRIPE_SECRET_KEY).toBe('stripe-key-from-file');
    expect(result.EMAIL_FROM_ADDRESS).toBe('Example Sender <no-reply@mail.example.test>');
    expect(result.S3_SECRET_ACCESS_KEY).toBe('real/secret+key=');
    expect(result.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('https://otlp.collector.test');
    // Not in the template at all, still copied — and a value with a space reads back unchanged.
    expect(result.OTEL_EXPORTER_OTLP_HEADERS).toBe('authorization=Bearer collector-token');
    // Not an external credential: the local value stays even though the source differs.
    expect(result.LOG_LEVEL).toBe('debug');
  });

  it('falls back to the process environment, per key, when the env file is absent or lacks a key', () => {
    const environment = {
      label: 'environment variables',
      values: { STRIPE_SECRET_KEY: 'stripe-key-from-shell', RESEND_API_KEY: 're_fromShell' },
    };
    // No env file at all.
    const withoutFile = fillExternalCredentials({
      local: EXAMPLE,
      example: EXAMPLE,
      sources: [environment],
    });
    expect(withoutFile.copied).toEqual([
      { key: 'STRIPE_SECRET_KEY', source: 'environment variables' },
      { key: 'RESEND_API_KEY', source: 'environment variables' },
    ]);
    // The file wins where it has a real value; the environment fills what the file lacks.
    const withFile = fillExternalCredentials({
      local: EXAMPLE,
      example: EXAMPLE,
      sources: [
        file('env file', 'STRIPE_SECRET_KEY=stripe-key-from-file\nRESEND_API_KEY=re_xxx'),
        environment,
      ],
    });
    expect(withFile.copied).toEqual([
      { key: 'STRIPE_SECRET_KEY', source: 'env file' },
      { key: 'RESEND_API_KEY', source: 'environment variables' },
    ]);
    expect(dotenv.parse(withFile.content)).toMatchObject({
      STRIPE_SECRET_KEY: 'stripe-key-from-file',
      RESEND_API_KEY: 're_fromShell',
    });
  });

  it('never overwrites a value the developer already set', () => {
    const local = EXAMPLE.replace('RESEND_API_KEY=re_xxx', 'RESEND_API_KEY=re_myOwnKey');
    const fill = fillExternalCredentials({
      local,
      example: EXAMPLE,
      sources: [
        file(
          'env file',
          'RESEND_API_KEY=re_fromDevelopment\nSTRIPE_SECRET_KEY=stripe-key-from-development',
        ),
      ],
    });
    expect(fill.kept).toContain('RESEND_API_KEY');
    expect(dotenv.parse(fill.content).RESEND_API_KEY).toBe('re_myOwnKey');
    expect(fill.copied).toEqual([{ key: 'STRIPE_SECRET_KEY', source: 'env file' }]);
  });

  it('does not copy a placeholder or blank value from any source — reports the key as missing', () => {
    const fill = fillExternalCredentials({
      local: EXAMPLE,
      example: EXAMPLE,
      sources: [
        file('env file', 'STRIPE_SECRET_KEY=sk_test_xxx\nRESEND_API_KEY='),
        { label: 'environment variables', values: { STRIPE_SECRET_KEY: '  ' } },
      ],
    });
    expect(fill.copied).toEqual([]);
    expect(fill.missing).toContain('STRIPE_SECRET_KEY');
    expect(fill.missing).toContain('RESEND_API_KEY');
    expect(fill.content).toBe(EXAMPLE);
  });

  it('with no source holding a real value, changes nothing and lists every placeholder as missing', () => {
    const fill = fillExternalCredentials({
      local: EXAMPLE,
      example: EXAMPLE,
      sources: [{ label: 'environment variables', values: {} }],
    });
    expect(fill.content).toBe(EXAMPLE);
    // Only keys with reportMissing are listed: S3_REGION's template value may be the real one, and
    // the collector auth headers are optional.
    expect(fill.missing).toEqual(REPORTED_KEYS);
    expect(fill.missing).not.toContain('S3_REGION');
  });

  it('adds a key the local file does not declare at all', () => {
    const fill = fillExternalCredentials({
      local: 'LOG_LEVEL=debug\n',
      example: EXAMPLE,
      sources: [file('env file', 'STRIPE_SECRET_KEY=stripe-key-from-file')],
    });
    expect(dotenv.parse(fill.content)).toMatchObject({
      LOG_LEVEL: 'debug',
      STRIPE_SECRET_KEY: 'stripe-key-from-file',
    });
  });

  it('comments out a retired placeholder when no source has a real value', () => {
    const local = `${EXAMPLE}OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com\n`;
    const fill = fillExternalCredentials({ local, example: EXAMPLE, sources: [] });
    expect(fill.retired).toEqual(['OTEL_EXPORTER_OTLP_ENDPOINT']);
    expect(fill.missing).not.toContain('OTEL_EXPORTER_OTLP_ENDPOINT');
    expect(dotenv.parse(fill.content).OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(fill.content).toContain('# OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com');
  });

  it('replaces a retired placeholder with a real source value, but never copies one', () => {
    const local = `${EXAMPLE}OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com\n`;
    const replaced = fillExternalCredentials({
      local,
      example: EXAMPLE,
      sources: [file('env file', 'OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.collector.test')],
    });
    expect(dotenv.parse(replaced.content).OTEL_EXPORTER_OTLP_ENDPOINT).toBe(
      'https://otlp.collector.test',
    );
    expect(replaced.retired).toEqual([]);
    const notCopied = fillExternalCredentials({
      local: EXAMPLE,
      example: EXAMPLE,
      sources: [file('env file', 'OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com')],
    });
    expect(notCopied.copied).toEqual([]);
    expect(dotenv.parse(notCopied.content).OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
  });

  it('keeps a real collector endpoint the developer set', () => {
    const local = `${EXAMPLE}OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318\n`;
    const fill = fillExternalCredentials({ local, example: EXAMPLE, sources: [] });
    expect(fill.kept).toContain('OTEL_EXPORTER_OTLP_ENDPOINT');
    expect(fill.retired).toEqual([]);
  });

  it('reports key names and source labels only — no value ever appears in the outcome', () => {
    const fill = fillExternalCredentials({
      local: EXAMPLE,
      example: EXAMPLE,
      sources: [file('env file', 'STRIPE_SECRET_KEY=stripe-key-from-file')],
    });
    const reported = JSON.stringify([fill.copied, fill.kept, fill.missing]);
    expect(reported).not.toContain('stripe-key-from-file');
  });
});
