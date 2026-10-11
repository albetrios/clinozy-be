import { describe, expect, it } from 'vitest';
import {
  formatResponsePayload,
  isPaddleEnvelope,
} from '@/shared/middlewares/core/response-format.middleware.js';

describe('formatResponsePayload', () => {
  it('returns raw, error, and non-JSON payloads unchanged', () => {
    expect(
      formatResponsePayload({
        payload: { ok: true },
        context: {
          rawResponse: true,
          statusCode: 200,
          contentType: 'application/json',
          requestId: 'req_1',
        },
      }),
    ).toEqual({ ok: true });

    expect(
      formatResponsePayload({
        payload: { error: 'bad' },
        context: {
          statusCode: 400,
          contentType: 'application/json',
          requestId: 'req_1',
        },
      }),
    ).toEqual({ error: 'bad' });

    expect(
      formatResponsePayload({
        payload: 'plain',
        context: {
          statusCode: 200,
          contentType: 'text/plain',
          requestId: 'req_1',
        },
      }),
    ).toBe('plain');
  });

  it('passes through existing Paddle object envelopes without re-wrapping', () => {
    const envelope = {
      data: { id: 'sub_1' },
      meta: { request_id: 'existing' },
    };
    expect(
      formatResponsePayload({
        payload: envelope,
        context: {
          statusCode: 200,
          contentType: 'application/json',
          requestId: 'req_1',
        },
      }),
    ).toBe(envelope);
    expect(isPaddleEnvelope(envelope)).toBe(true);
  });

  it('wraps JSON object payloads when content-type is application/json', () => {
    expect(
      formatResponsePayload({
        payload: { value: 1 },
        context: {
          statusCode: 200,
          contentType: 'application/json',
          requestId: 'req_object',
        },
      }),
    ).toEqual({
      data: { value: 1 },
      meta: { request_id: 'req_object' },
    });
  });

  it('wraps JSON string payloads and preserves invalid JSON strings', () => {
    expect(
      formatResponsePayload({
        payload: JSON.stringify({ value: 2 }),
        context: {
          statusCode: 200,
          contentType: 'application/json',
          requestId: 'req_string',
        },
      }),
    ).toBe(
      JSON.stringify({
        data: { value: 2 },
        meta: { request_id: 'req_string' },
      }),
    );

    expect(
      formatResponsePayload({
        payload: '{not-json',
        context: {
          statusCode: 200,
          contentType: 'application/json',
          requestId: 'req_invalid',
        },
      }),
    ).toBe('{not-json');
  });

  it('does not wrap when content-type is not a string', () => {
    expect(
      formatResponsePayload({
        payload: JSON.stringify({ ok: true }),
        context: {
          statusCode: 200,
          contentType: ['application/json'],
          requestId: 'req_1',
        },
      }),
    ).toBe('{"ok":true}');
  });
});
