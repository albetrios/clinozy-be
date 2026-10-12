import { describe, expect, it } from 'vitest';
import { routeResponseMap } from '@tooling/openapi/response-map/index.js';
import {
  wrapPaginated,
  wrapSuccess,
  wrapUncountedPaginated,
} from '@tooling/openapi/response-map/building-blocks.js';
import { PAYMENT_EDIT_RECORDED_FIELDS } from '@/domains/app/sub-domains/billing/payments/payments.constants.js';

/** The `meta.pagination` a paginated response documents — its schema and its example. */
type PaginatedShape = {
  properties: {
    data: { items: { properties: Record<string, { properties?: Record<string, unknown> }> } };
    meta: { properties: { pagination: { properties: Record<string, unknown> } } };
  };
  example: { meta: { pagination: Record<string, unknown> } };
};

/** The documented 200 of a route, read as a paginated shape. */
function paginatedResponse(routeKey: string): PaginatedShape {
  return routeResponseMap[routeKey]?.schema as PaginatedShape;
}

describe('response-map', () => {
  it('routeResponseMap includes health and auth login responses', () => {
    expect(routeResponseMap['GET /readyz']?.statusCode).toBe(200);
    expect(routeResponseMap['POST /api/v1/auth/login']?.statusCode).toBe(200);
  });

  it('wrapSuccess nests data under meta envelope', () => {
    const wrapped = wrapSuccess({ type: 'object' }, { id: '1' }) as {
      example: { data: unknown; meta: { request_id: string } };
    };
    expect(wrapped.example.meta.request_id).toBe('018f2c7a-3b4d-4e5f-9a6b-7c8d9e0f1a2b');
    expect(wrapped.example.data).toEqual({ id: '1' });
  });

  it('wrapUncountedPaginated documents a page without estimated_total, schema and example', () => {
    const counted = wrapPaginated({ type: 'object' }, [{ id: '1' }]) as PaginatedShape;
    const uncounted = wrapUncountedPaginated({ type: 'object' }, [{ id: '1' }]) as PaginatedShape;
    expect(Object.keys(counted.properties.meta.properties.pagination.properties)).toContain(
      'estimated_total',
    );
    expect(Object.keys(uncounted.properties.meta.properties.pagination.properties)).toEqual([
      'per_page',
      'next',
      'has_more',
    ]);
    expect(uncounted.example.meta.pagination).not.toHaveProperty('estimated_total');
    expect(counted.example.meta.pagination).toHaveProperty('estimated_total', 1);
  });

  it('maps the lists that never count without estimated_total (SHELL-M2)', () => {
    for (const routeKey of [
      'GET /api/v1/app/memberships',
      'GET /api/v1/app/roles',
      'GET /api/v1/users/me/organizations',
      'GET /api/v1/tenancy/organization/roles',
      'GET /api/v1/tenancy/organization/api-keys',
      'GET /api/v1/app/payments/{payment_id}/edits',
    ]) {
      const pagination = paginatedResponse(routeKey).properties.meta.properties.pagination;
      expect(pagination.properties, routeKey).not.toHaveProperty('estimated_total');
    }
    const tasks = paginatedResponse('GET /api/v1/app/tasks').properties.meta.properties.pagination;
    expect(tasks.properties).toHaveProperty('estimated_total');
  });

  it("types a payment edit's changes by the fields the code records (PAY-M5)", () => {
    const edit = paginatedResponse('GET /api/v1/app/payments/{payment_id}/edits').properties.data
      .items.properties;
    expect(Object.keys(edit.changes?.properties ?? {})).toEqual([...PAYMENT_EDIT_RECORDED_FIELDS]);
  });
});
