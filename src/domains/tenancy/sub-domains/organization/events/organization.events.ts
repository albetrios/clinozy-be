/**
 * Organization resource events — emitted by {@link OrganizationService} with the organization's
 * public JSON and delivered to the organization's subscribed webhooks by the notify domain.
 */
export const ORGANIZATION_EVENT = {
  CREATED: 'organization.created',
  UPDATED: 'organization.updated',
} as const;

/** Union of literal event codes defined by {@link ORGANIZATION_EVENT}. */
export type OrganizationEventType = (typeof ORGANIZATION_EVENT)[keyof typeof ORGANIZATION_EVENT];
