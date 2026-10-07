/**
 * Canonical specialty values for `tenancy.organizations.specialties` — the single source of
 * truth shared by the Drizzle schema CHECK (`chk_organizations_specialties_allowed`) and the
 * validators that write it.
 *
 * @remarks
 * - **Algorithm:** the object literal is the authority; {@link ORGANIZATION_SPECIALTIES} derives the
 *   allowed-value list the schema CHECK is built from, so adding a specialty is one edit here plus a
 *   migration that replaces the CHECK.
 * - **Failure modes:** a specialty outside these values violates the CHECK and raises Postgres
 *   `23514` — callers validate against this list first.
 * - **Notes:** the lowercase machine values are the launch drop's (`schema-routes.md` › Enum
 *   offering_specialty), which clinozy-fe already sends; the offering's specialty (Stage 2) reads the
 *   same list.
 */
export const ORGANIZATION_SPECIALTY = {
  SKIN: 'skin',
  HAIR: 'hair',
  DENTAL: 'dental',
  GYNAC: 'gynac',
  PHYSIO: 'physio',
  GENERAL: 'general',
} as const;

/** Literal union of supported {@link ORGANIZATION_SPECIALTY} values. */
export type OrganizationSpecialty =
  (typeof ORGANIZATION_SPECIALTY)[keyof typeof ORGANIZATION_SPECIALTY];

/** All allowed specialty values, used to derive the schema CHECK constraint. */
export const ORGANIZATION_SPECIALTIES = Object.values(
  ORGANIZATION_SPECIALTY,
) as OrganizationSpecialty[];

/** Most specialties one organization may list (`chk_organizations_specialties_count`). */
export const ORGANIZATION_SPECIALTIES_MAX_COUNT = 6;

/** Specialties a new organization starts with. */
export const ORGANIZATION_DEFAULT_SPECIALTIES: readonly OrganizationSpecialty[] = [
  ORGANIZATION_SPECIALTY.SKIN,
];

/** IANA timezone a new organization starts with; timed work runs in the organization's timezone. */
export const ORGANIZATION_DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** The one currency an organization trades in at launch — server-set, never client-written. */
export const ORGANIZATION_CURRENCY = 'INR';
