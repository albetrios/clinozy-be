/**
 * Shared OpenAPI response wrappers (success + paginated envelopes).
 */
import { LIST_TOTAL_COUNT_CAP } from '@/shared/constants/index.js';

// ─── Shared building blocks ────────────────────────────────────────────

export const metaSchema = {
  type: 'object' as const,
  properties: {
    request_id: { type: 'string', example: '018f2c7a-3b4d-4e5f-9a6b-7c8d9e0f1a2b' },
  },
  required: ['request_id'],
};

export const paginationMetaSchema = {
  type: 'object' as const,
  properties: {
    request_id: { type: 'string', example: '018f2c7a-3b4d-4e5f-9a6b-7c8d9e0f1a2b' },
    pagination: {
      type: 'object',
      properties: {
        per_page: { type: 'integer', example: 20 },
        next: {
          type: 'string',
          nullable: true,
          example:
            'eyJjcmVhdGVkX2F0IjoiMjAyNi0wNS0xOVQxMjowMDowMC4wMDBaIiwicHVibGljX2lkIjoiYWJjMTIzNDU2Nzg5MDEyMzQ1Njc4IiwiaWQiOjQyfQ',
          description:
            'Opaque cursor to pass as the `after` query parameter on the next request. Null when `has_more` is false.',
        },
        has_more: { type: 'boolean', example: false },
        estimated_total: {
          type: 'integer',
          example: 3,
          description: `How many rows the filters match, counted up to ${LIST_TOTAL_COUNT_CAP.toLocaleString('en-US')} (that figure means "at least") — on the first page only (no \`after\`); absent on later pages, on lists that count only on request (\`include_total=true\`) and on lists that never count.`,
        },
      },
    },
  },
  required: ['request_id', 'pagination'],
};

export function wrapSuccess(dataSchema: object, dataExample: unknown): object {
  return {
    type: 'object',
    properties: {
      data: dataSchema,
      meta: metaSchema,
    },
    example: {
      data: dataExample,
      meta: { request_id: '018f2c7a-3b4d-4e5f-9a6b-7c8d9e0f1a2b' },
    },
  };
}

export function wrapPaginated(
  itemSchema: object,
  itemExamples: unknown[],
  extraMetaProperties: Readonly<Record<string, object>> = {},
): object {
  return {
    type: 'object',
    properties: {
      data: { type: 'array', items: itemSchema },
      meta: {
        ...paginationMetaSchema,
        properties: { ...extraMetaProperties, ...paginationMetaSchema.properties },
      },
    },
    example: {
      data: itemExamples,
      meta: {
        request_id: '018f2c7a-3b4d-4e5f-9a6b-7c8d9e0f1a2b',
        pagination: {
          per_page: 20,
          next: 'eyJjcmVhdGVkX2F0IjoiMjAyNi0wNS0xOVQxMjowMDowMC4wMDBaIiwicHVibGljX2lkIjoiYWJjMTIzNDU2Nzg5MDEyMzQ1Njc4IiwiaWQiOjQyfQ',
          has_more: true,
          estimated_total: itemExamples.length,
        },
      },
    },
  };
}
/**
 * {@link wrapPaginated} for a list that never counts (`GET /app/memberships`, `GET /app/roles`,
 * `GET /users/me/organizations`): its `meta.pagination` has no `estimated_total`, on any page.
 */
export function wrapUncountedPaginated(itemSchema: object, itemExamples: unknown[]): object {
  const wrapped = wrapPaginated(itemSchema, itemExamples) as {
    properties: { meta: { properties: Record<string, unknown> } };
    example: { meta: { pagination: Record<string, unknown> } };
  };
  const meta = wrapped.properties.meta;
  const pagination = meta.properties.pagination as { properties: Record<string, unknown> };
  const { estimated_total: _countedOnly, ...uncountedProperties } = pagination.properties;
  const { estimated_total: _exampleCount, ...uncountedExample } = wrapped.example.meta.pagination;
  return {
    ...wrapped,
    properties: {
      ...wrapped.properties,
      meta: {
        ...meta,
        properties: {
          ...meta.properties,
          pagination: { ...pagination, properties: uncountedProperties },
        },
      },
    },
    example: {
      ...wrapped.example,
      meta: { ...wrapped.example.meta, pagination: uncountedExample },
    },
  };
}

// ─── Response definition type ──────────────────────────────────────────

export interface ResponseDefinition {
  statusCode: number;
  schema: object | null; // null = no body (204)
  example: unknown;
}
