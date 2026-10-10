import type { OrganizationOutput } from './organization.types.js';

/**
 * Maps an organization Drizzle row to the public {@link OrganizationOutput}
 * shape — exposes `public_id` as `id`, names the owner by their user public id
 * (`owner_user_id`, launch D81 (4)), drops internal numeric and audit columns,
 * and serialises timestamps as ISO 8601 strings.
 */
export function serializeOrganization(row: {
  public_id: string;
  name: string;
  slug: string | null;
  type: string;
  status: string;
  /** The owner's user public id (`usr_…`), resolved by the caller; null when the login is gone. */
  owner_user_public_id: string | null;
  logo_url: string | null;
  specialties: string[];
  timezone: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
}): OrganizationOutput {
  return {
    id: row.public_id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    status: row.status,
    owner_user_id: row.owner_user_public_id,
    logo_url: row.logo_url,
    specialties: row.specialties,
    timezone: row.timezone,
    currency: row.currency,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
