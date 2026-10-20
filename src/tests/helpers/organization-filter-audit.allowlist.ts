/**
 * Statements that run inside an organization, read or change a tenant table, and name neither the
 * organization nor an internal id — so Postgres RLS is their only filter — keyed by
 * `statementFingerprint`, each with where it comes from.
 *
 * @remarks
 * Each entry is a debt, not an exemption: the fix is the repository's `organization_id` filter,
 * after which the entry goes. The audit (`organization-filter-audit.setup.ts`) fails a test file
 * on any statement of this kind that is not listed, so a filter dropped from a repository fails the
 * push. Measured on the full e2e + integration run of 20 Oct 2026 and CI's RLS application role
 * lanes: 21 shapes, all reads or updates by client-sent public ids or keys, none a list.
 */
export const RLS_ONLY_STATEMENTS: Readonly<Record<string, string>> = {
  dbc2f8e99d51: 'contacts.repository.ts: patients of the given contacts, by contacts.public_id',
  '65a43bdafd80': 'contacts.repository.ts: contact summaries by public_id',
  f6e037df9540: 'leads.repository.ts: leads of the given contacts, by contacts.public_id',
  '160e6acaeeab':
    'appointments.repository.ts: appointments of the given contacts, by contacts.public_id',
  '96c08ba4ed5c': 'invoices.repository.ts: treatments of the given patient offerings, by public_id',
  '833138d660b5': 'payments.repository.ts: the invoices a payment links to, by public_id',
  cd7ada3cb4b8: 'offerings.repository.ts: offering prices by public_id',
  a6385b12e943: 'suppliers.repository.ts: supplier summaries by public_id',
  '8eaa624971b8': 'patients.repository.ts: patient and contact names by patients.public_id',
  '4c3987034da7': 'upload.repository.ts: an upload by its storage file_key',
  '1e6198482491':
    'webhook-delivery.repository.ts: the organization of a delivery attempt, by its public_id',
  '77acdaf94a93': 'payments.repository.ts: the credit notes a payment links to, by public_id',
  '3567c10fd7b1': 'patient-offering-suggestions.repository.ts: appointment labels by public_id',
  '72901795637e': 'patient-images.repository.ts: appointment labels by public_id',
  '7f42f1553188': 'payments.repository.ts: the purchase orders a payment links to, by public_id',
  '9a7807a5efd4': 'patient-offering-suggestions.repository.ts: check-in labels by public_id',
  '38f5167e38b3': 'payments.repository.ts: the pending credits a payment links to, by public_id',
  '05d09a34f13a': 'payments.repository.ts: the stock purchases a payment links to, by public_id',
  baf3f6483a6f:
    'upload.repository.ts: an upload by public_id; a personal upload has no organization_id, so the owner or tenant arm decides',
  '9337da02cae6':
    'upload.repository.ts: confirming an upload by public_id; same owner-or-tenant reason as the read',
  '38a99fcf7c2f':
    'organization-api-key.repository.ts: last_used_at of a key already verified by its hash',
};
