/**
 * Payload of an organization resource event: a public resource (the organization, a membership, a
 * subscription) changed inside an organization. The producing service emits it inside the write's
 * organization database context, so the notify handler that delivers it to the organization's
 * subscribed webhooks records their delivery attempts in that same transaction.
 */
export interface OrganizationResourceEventPayload {
  /** Public id of the organization the resource belongs to. */
  organization_public_id: string;
  /** The resource's public JSON — exactly what its serializer returns over the API. */
  data: Record<string, unknown>;
}
