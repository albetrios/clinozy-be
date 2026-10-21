import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { withAppDatabaseContext } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import type { ContactsService } from '@/domains/app/sub-domains/contacts/contacts.service.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { memberReference } from '@/domains/app/app-member-reference.js';
import type { PatientsRepository } from './patients.repository.js';
import { patientsRules } from './patients.rules.js';
import { serializePatient } from './patients.serializer.js';
import type { PatientExportRow, PatientOutput } from './patients.types.js';
import {
  validateCreatePatient,
  validateListPatientsQuery,
  validateUpdatePatient,
} from './patients.validator.js';

/**
 * Patient files of the active organization (launch ROUTE #133, routes-final 7.A): the clinical side
 * of a contact — list and export, read, add (for a contact, or with a new one), change, soft-delete
 * with a reason, restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references, rules
 *   and serializer; every call runs in the caller's organization context. A create with an inline
 *   `contact` writes the contact through the {@link ContactsService} (its rules — numbers,
 *   household) and the file in the same transaction (P1). The export joins each file's contact name
 *   and primary number in (7.A.6). Not branch-scoped (P6).
 * - **Failure modes:** `NotFoundError('Patient')`; `ValidationError` for a bad body or query, or a
 *   reference that is no live record here; `ConflictError` `contact_is_patient` (P1),
 *   `contact_phone_exists` (an inline contact's number, CT3), a stale save or a restore of a live
 *   file.
 */
export class PatientsService extends BaseRecordService<PatientOutput> {
  private readonly contactsRepository = new ContactsRepository();

  constructor(
    organizationService: OrganizationService,
    repository: PatientsRepository,
    private readonly contactsService: ContactsService,
  ) {
    super(organizationService, {
      label: 'Patient',
      repository,
      parseCreate: validateCreatePatient,
      parseUpdate: validateUpdatePatient,
      parseList: validateListPatientsQuery,
      serialize: serializePatient,
      references: [
        { field: 'contact_id', table: contacts, label: 'contact' },
        { field: 'home_branch_id', table: branches, label: 'branch' },
        memberReference('doctor_membership_id'),
        { field: 'lead_id', table: leads, label: 'lead' },
      ],
      conflicts: {
        idx_patients_organization_contact_unique: {
          key: 'errors:contactIsPatientGeneric',
          reason: 'contact_is_patient',
        },
      },
      ...patientsRules,
    });
  }

  /**
   * Adds a patient file — for `contact_id`, or with a new `contact` created first in the same
   * transaction (P1); the controller lets only `contact:create` holders send `contact`.
   */
  override async create({
    scope,
    body,
    actingUserPublicId,
    parentPublicId,
    visibility,
    createName,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    actingUserPublicId: string | undefined;
    parentPublicId?: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    createName?: string | undefined;
  }): Promise<PatientOutput> {
    if (validateCreatePatient(body).contact === undefined) {
      return super.create({
        scope,
        body,
        actingUserPublicId,
        parentPublicId,
        visibility,
        createName,
      });
    }
    const { contact, ...patient } = body as Record<string, unknown>;
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const created = await this.contactsService.create({
          scope,
          body: contact,
          actingUserPublicId,
          parentPublicId: undefined,
          visibility,
        });
        return super.create({
          scope,
          body: { ...patient, contact_id: created.id },
          actingUserPublicId,
          parentPublicId,
          visibility,
          createName,
        });
      },
    });
  }

  /** The export's rows (7.A.6): each file with its contact's name and primary number joined in. */
  override async exportRows({
    scope,
    query,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    query: unknown;
    options: {
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
      derived?: Readonly<Record<string, unknown>> | undefined;
    };
  }): Promise<{ rows: PatientExportRow[]; is_truncated: boolean }> {
    const { rows, is_truncated } = await super.exportRows({ scope, query, options });
    const summaries = await withAppDatabaseContext({
      scope,
      callback: async () =>
        this.contactsRepository.findSummaries(
          [...new Set(rows.map((row) => row.contact_id))],
          await this.organizationId(scope),
        ),
    });
    const contactOf = new Map(summaries.map((contact) => [contact.id, contact]));
    return {
      rows: rows.map((row) => {
        const contact = contactOf.get(row.contact_id);
        return {
          ...row,
          contact_name: contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(' ')
            : null,
          contact_primary_phone: contact?.primary_phone ?? null,
        };
      }),
      is_truncated,
    };
  }
}
