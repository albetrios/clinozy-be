import type { AppointmentsService } from '@/domains/app/sub-domains/appointments/appointments.service.js';
import type { InvoicesService } from '@/domains/app/sub-domains/invoices/invoices.service.js';
import type { LeadsService } from '@/domains/app/sub-domains/leads/leads.service.js';
import type { PatientsService } from '@/domains/app/sub-domains/patients/patients.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import type { SearchAccess, SearchOutput } from './searches.types.js';
import { validateListSearchesQuery } from './searches.validator.js';

/** Records per kind the search returns (schema-routes.md:1565). */
const RESULTS_PER_KIND = 10;
/** Patients whose appointments and invoices also count as matches. */
const PATIENTS_FOLLOWED = 5;

/**
 * The services the search reads — each table's own, so its rules and visibility apply.
 *
 * @remarks
 * - **Notes:** the app container passes its record services.
 */
export interface SearchesSources {
  patientsService: PatientsService;
  leadsService: LeadsService;
  appointmentsService: AppointmentsService;
  invoicesService: InvoicesService;
}

/**
 * The command search (launch RC-139, ROUTE #62): patients, leads, appointments and invoices by
 * name, phone digits or number.
 *
 * @remarks
 * - **Algorithm:** each kind is its own table's list with `q` (names, phones, and the running
 *   number when `q` reads as one — `2841`, `#2841`, `PT-0412`), 10 per kind; appointments and
 *   invoices also include those of the first 5 patients found (one `IN` query per kind), newest
 *   first, de-duplicated; no counts are run.
 *   Hidden contact threads never show among leads.
 * - **Failure modes:** `ValidationError` for a `q` under 2 or over 80 characters.
 * - **Notes:** a kind the caller may not read is empty; branch-scoped kinds follow D9.
 */
export class SearchesService {
  constructor(private readonly sources: SearchesSources) {}

  /**
   * Searches every kind the caller may read.
   *
   * @remarks
   * - **Algorithm:** see the class.
   * - **Failure modes:** `ValidationError`.
   */
  async search(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
    access: SearchAccess,
  ): Promise<SearchOutput> {
    const { q } = validateListSearchesQuery(query);
    const options = {
      actingUserPublicId: access.actingUserPublicId,
      visibility: access.visibility,
      withTotal: false,
    };
    const page = { q, limit: RESULTS_PER_KIND };
    const patients = access.patients
      ? (await this.sources.patientsService.list(scope, page, options)).items
      : [];
    const leads = access.leads
      ? (await this.sources.leadsService.list(scope, page, options)).items
      : [];
    const followed = patients.slice(0, PATIENTS_FOLLOWED).map((patient) => patient.id);
    // The followed patients' records in one `IN` query per kind (schema review H5).
    const ofFollowed = { ...options, referenceIn: { patient_id: followed } };
    const appointments = access.appointments
      ? mergeUnique(
          (await this.sources.appointmentsService.list(scope, page, options)).items,
          followed.length === 0
            ? []
            : (
                await this.sources.appointmentsService.list(
                  scope,
                  { limit: RESULTS_PER_KIND, sort: 'appointment_date', order: 'desc' },
                  ofFollowed,
                )
              ).items,
        )
      : [];
    const invoices = access.invoices
      ? mergeUnique(
          (await this.sources.invoicesService.list(scope, page, options)).items,
          followed.length === 0
            ? []
            : (
                await this.sources.invoicesService.list(
                  scope,
                  { limit: RESULTS_PER_KIND, sort: 'invoice_date', order: 'desc' },
                  ofFollowed,
                )
              ).items,
        )
      : [];
    return { patients, leads, appointments, invoices };
  }
}

/** The direct matches, then the followed patients' records, each once, at most 10. */
function mergeUnique<Item extends { id: string }>(direct: Item[], followed: Item[]): Item[] {
  const seen = new Map(direct.map((item) => [item.id, item]));
  for (const item of followed) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()].slice(0, RESULTS_PER_KIND);
}
