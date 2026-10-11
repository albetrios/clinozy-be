import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import type { BaseRecordReference } from './base-record.types.js';

/**
 * A body field that names a team member — a membership of the organization (`mem_…` on the wire,
 * the membership's internal id in the column).
 *
 * @remarks
 * - **Algorithm:** binds the field to tenancy's `memberships` table, which the base repository
 *   joins to resolve and check the id; the 400 for an unknown id says "team member".
 * - **Notes:** the one place the app's record descriptors reach the tenancy schema, so the
 *   services that declare them stay inside the app domain (the cross-domain service boundary).
 */
export function memberReference(field: string): BaseRecordReference {
  return { field, table: memberships, label: 'team member' };
}
