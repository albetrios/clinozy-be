import { describe, expect, it } from 'vitest';
import {
  type AppRecordServices,
  createAppRecordServices,
} from '@/domains/app/app-records.container.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { NotFoundError, ValidationError } from '@/shared/errors/index.js';

/** A scope no database work ever reads — every case below is refused before one opens. */
const UNREACHED_SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/** An organization service no case reaches. */
const UNREACHED_ORGANIZATION_SERVICE = {} as OrganizationService;

/** A record id of no table — never looked up. */
const UNREACHED_RECORD_ID = 'rec_aaaaaaaaaaaaaaaaaaaaa';

/**
 * Which generic writes a table does not have — an append-only ledger is never changed, a record
 * made by another write has no create of its own. Each names the words of the service's refusal.
 */
export interface AppRecordServiceContractOptions {
  refusesCreate?: RegExp;
  refusesUpdate?: RegExp;
}

/** The call is refused by the service itself — with its own words, never a database failure. */
async function expectRefusedWithoutDatabase(call: Promise<unknown>, words: RegExp): Promise<void> {
  const error = await call.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(words);
  expect((error as Error).message).not.toMatch(/Failed query/);
}

/**
 * The contract every app record service keeps (the shared `BaseRecordService` kernel, launch
 * ROUTE #124 onwards): a create body, a change, a list query and a lifecycle action are parsed
 * against the table's own DTOs **before** any database context opens — an unknown body field, an
 * unknown filter and an unknown action are refused there, so a bad request never costs a
 * connection or reaches a rule.
 *
 * @remarks
 * - **Algorithm:** builds the services the way the app container does
 *   (`createAppRecordServices`, no database, no Redis) and calls the named one's create, update,
 *   list and transition with inputs its strict DTOs refuse; a table without a generic create or
 *   change (`options`) must refuse it with its own words, still before any database work.
 * - **Failure modes:** a case fails when the service accepts an unknown key (a DTO that is not
 *   `.strict()`), reaches the database first, or answers with another error.
 */
export function describeAppRecordServiceContract(
  name: keyof AppRecordServices,
  options: AppRecordServiceContractOptions = {},
): void {
  describe(`${name} — parses before any database work`, () => {
    const service = createAppRecordServices(UNREACHED_ORGANIZATION_SERVICE)[name];

    it(
      options.refusesCreate
        ? 'has no generic create — refused before any database work'
        : 'refuses a create body with an unknown field (400)',
      async () => {
        const call = service.create(UNREACHED_SCOPE, { not_a_field: true }, undefined);
        if (options.refusesCreate) await expectRefusedWithoutDatabase(call, options.refusesCreate);
        else await expect(call).rejects.toBeInstanceOf(ValidationError);
      },
    );

    it(
      options.refusesUpdate
        ? 'is never changed — refused before any database work'
        : 'refuses a change with an unknown field (400)',
      async () => {
        const call = service.update(
          UNREACHED_SCOPE,
          UNREACHED_RECORD_ID,
          { not_a_field: true },
          undefined,
        );
        if (options.refusesUpdate) await expectRefusedWithoutDatabase(call, options.refusesUpdate);
        else await expect(call).rejects.toBeInstanceOf(ValidationError);
      },
    );

    it('refuses a list query with an unknown filter (400)', async () => {
      await expect(service.list(UNREACHED_SCOPE, { not_a_filter: 'x' })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('answers an action the table does not have as not found (404)', async () => {
      await expect(
        service.transition(UNREACHED_SCOPE, UNREACHED_RECORD_ID, 'not-an-action', {}, undefined),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
}
