/** Tenancy resource schemas. */
// ── Organization ──
export const organizationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    // Kept non-nullable to match the published contract; a personal org's null
    // slug is discoverable from `type === 'PERSONAL'`. Flipping this to nullable is a breaking
    // response change and out of scope here.
    slug: { type: 'string' },
    type: {
      type: 'string',
      enum: ['PERSONAL', 'TEAM'],
      description: 'Possible values: PERSONAL | TEAM',
      example: 'TEAM',
    },
    status: {
      type: 'string',
      enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'],
      description: 'Possible values: ACTIVE | SUSPENDED | ARCHIVED',
      example: 'ACTIVE',
    },
    owner_user_id: {
      type: 'string',
      nullable: true,
      description:
        "The owner's user id (`usr_…`) — compare with your own user id to know whether you own it; null only when the owner's login is gone.",
      example: 'usr_a1b2c3d4e5f6g7h8i9j0k',
    },
    logo_url: { type: 'string', nullable: true },
    specialties: {
      type: 'array',
      items: { type: 'string', enum: ['skin', 'hair', 'dental', 'gynac', 'physio', 'general'] },
      example: ['skin'],
    },
    timezone: { type: 'string', example: 'Asia/Kolkata' },
    currency: { type: 'string', example: 'INR' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

export const organizationExample = {
  id: 'org_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Acme Corporation',
  slug: 'acme-corporation',
  type: 'TEAM',
  status: 'ACTIVE',
  owner_user_id: 'usr_a1b2c3d4e5f6g7h8i9j0k',
  logo_url: 'https://cdn.example.com/logos/acme-corp.png',
  specialties: ['skin'],
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-10T12:00:00.000Z',
};

// ── Organization Settings ──
export const organizationSettingsSchema = {
  type: 'object',
  properties: {
    organization_id: { type: 'string' },
    is_email_notifications_enabled: { type: 'boolean' },
    security_policy: { type: 'object' },
    default_day_float: { type: 'number', example: 2000, description: 'Rupees' },
    lead_hold_days: { type: 'integer', example: 3 },
    reminder_hour: { type: 'integer', example: 16, description: '0–23, organization time zone' },
    retarget_after_days: { type: 'integer', example: 90 },
    deleted_record_purge_days: { type: 'integer', example: 7 },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

export const organizationSettingsExample = {
  organization_id: 'org_k7x9m2pqr4w8n1v3a1b2c',
  is_email_notifications_enabled: true,
  security_policy: { mfa_required: true, session_timeout_minutes: 30 },
  default_day_float: 2000,
  lead_hold_days: 3,
  reminder_hour: 16,
  retarget_after_days: 90,
  deleted_record_purge_days: 7,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-10T12:00:00.000Z',
};

// ── Organization API Key ──
export const apiKeySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    organization_id: { type: 'string' },
    name: { type: 'string' },
    key_prefix: { type: 'string' },
    last_used_at: { type: 'string', format: 'date-time', nullable: true },
    expires_at: { type: 'string', format: 'date-time', nullable: true },
    status: {
      type: 'string',
      enum: ['ACTIVE', 'REVOKED'],
      description: 'Possible values: ACTIVE | REVOKED',
      example: 'ACTIVE',
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

// API key example for the OpenAPI response-map. These values surface in
// generated docs (Swagger / Redoc / Postman). Do NOT use Stripe-shaped
// prefixes (`sk_live_`, `sk_test_`, `whsec_`) here — GitHub Secret Scanning
// matches those patterns by raw regex against committed source and cannot
// distinguish a documentation placeholder from a leaked production secret.
// Use a clearly-fake redacted shape so future regenerations stay scanner-safe.
export const apiKeyExample = {
  id: 'key_x9k3m7n2p5q8w1r4a1b2c',
  organization_id: 'org_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Production API Key',
  key_prefix: 'ak_redacted',
  last_used_at: '2026-02-14T07:45:00.000Z',
  expires_at: '2027-02-14T00:00:00.000Z',
  status: 'ACTIVE',
  created_at: '2026-01-15T10:30:00.000Z',
  updated_at: '2026-02-10T14:20:00.000Z',
};

export const apiKeyCreatedExample = {
  ...apiKeyExample,
  key: '<api-key-shown-once>',
};

// ── Organization Notification Policy ──
export const notificationPolicySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: '^pol_[a-z0-9]{21}$' },
    organization_id: { type: 'string' },
    notification_type: { type: 'string' },
    channel: {
      type: 'string',
      enum: ['EMAIL', 'SMS', 'WEB_PUSH', 'IN_APP'],
      description: 'Possible values: EMAIL | SMS | WEB_PUSH | IN_APP',
      example: 'EMAIL',
    },
    default_enabled: { type: 'boolean' },
    is_mandatory: { type: 'boolean' },
    muted_until: { type: 'string', format: 'date-time', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

export const notificationPolicyExample = {
  id: 'pol_k7x9m2pqr4w8n1v3a5b6c',
  organization_id: 'org_k7x9m2pqr4w8n1v3a1b2c',
  notification_type: 'subscription.updated',
  channel: 'EMAIL',
  default_enabled: true,
  is_mandatory: false,
  muted_until: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-10T12:00:00.000Z',
};

// ── Membership ──
export const membershipSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    organization_id: { type: 'string' },
    status: {
      type: 'string',
      enum: ['invited', 'active', 'suspended'],
      description: 'Possible values: invited | active | suspended',
      example: 'invited',
    },
    is_owner: {
      type: 'boolean',
      description:
        "The organization's owner — their status and main role are fixed and they cannot be removed (403 reason owner_membership_fixed); they may hold extra roles after the main one.",
    },
    joined_at: { type: 'string', format: 'date-time', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    // Embedded display summary so a members table renders without an N+1 per-row user fetch.
    user: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        first_name: { type: 'string', nullable: true },
        last_name: { type: 'string', nullable: true },
        avatar_url: {
          type: 'string',
          nullable: true,
          description: 'Presigned read URL (or absolute provider URL); never a raw object key.',
        },
      },
    },
    display_name: {
      type: 'string',
      description:
        'The name the organization keeps — the profile name while live, frozen when the membership ends.',
    },
    ended_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'When the membership ended; null while live.',
    },
    end_reason: {
      type: 'string',
      nullable: true,
      enum: ['mistake', 'duplicate', 'not_needed', 'other', 'left', 'account_deleted', null],
      description: 'Why the membership ended; null while live.',
    },
    // Live (pending) invitation reference — present only on invited rows so the frontend can
    // Resend/Revoke from the members table; null for active/suspended rows.
    invitation: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        expires_at: { type: 'string', format: 'date-time' },
      },
    },
    // Staff profile (launch ROUTE #4).
    staff_number: {
      type: 'integer',
      description: 'The "#12" of the team table — per organization, never reused.',
    },
    phone: { type: 'string', nullable: true, example: '+919825044120' },
    tone: { type: 'string', example: 'sky' },
    role_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'Every role held, the main role first.',
    },
    branch_ids: { type: 'array', items: { type: 'string' } },
    working_days: {
      type: 'array',
      items: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
    },
    work_starts_at: { type: 'string', example: '10:00' },
    work_ends_at: { type: 'string', example: '19:00' },
    commission_percent: { type: 'number', example: 10 },
  },
};

export const membershipExample = {
  id: 'mem_q8w3n7p2m5k1r4t6a1b2c',
  user_id: 'usr_k7x9m2pqr4w8n1v3a1b2c',
  organization_id: 'org_k7x9m2pqr4w8n1v3a1b2c',
  status: 'active',
  is_owner: false,
  joined_at: '2026-01-15T10:30:00.000Z',
  created_at: '2026-01-15T10:30:00.000Z',
  updated_at: '2026-02-10T14:20:00.000Z',
  user: {
    id: 'usr_k7x9m2pqr4w8n1v3a1b2c',
    email: 'john.doe@example.com',
    first_name: 'John',
    last_name: 'Doe',
    avatar_url: 'https://cdn.example.com/avatars/john-doe.jpg',
  },
  display_name: 'John Doe',
  ended_at: null,
  end_reason: null,
  invitation: null,
  staff_number: 12,
  phone: '+919825044120',
  tone: 'sky',
  role_ids: ['rol_m3n7p2q8w5k1r4t6a1b2c'],
  branch_ids: ['brn_k7x9m2pqr4w8n1v3a1b2c'],
  working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  work_starts_at: '10:00',
  work_ends_at: '19:00',
  commission_percent: 10,
};

// ── Membership Invitation ──
export const invitationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    membership_id: { type: 'string' },
    email: { type: 'string', format: 'email' },
    expires_at: { type: 'string', format: 'date-time' },
    accepted_at: { type: 'string', format: 'date-time', nullable: true },
    revoked_at: { type: 'string', format: 'date-time', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
};

/**
 * The dev-only invitation accept-token echo (launch ROUTE #164, D82) — on the add-member answer's
 * `invitation` and on the resend answer, never in production.
 */
export const debugInvitationTokenProperty = {
  type: 'string',
  description:
    'The raw invitation accept token — present only in non-production, when MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED is on (the env schema refuses it in production; there the token travels only in the invitation email). Pass it as `token` to POST /tenancy/membership-invitations/{membership_invitation_id}/accept.',
};

export const invitationExample = {
  id: 'inv_r4t6m3n7p2q8w5k1a1b2c',
  membership_id: 'mem_q8w3n7p2m5k1r4t6a1b2c',
  email: 'jane.smith@example.com',
  expires_at: '2026-02-21T10:30:00.000Z',
  accepted_at: null,
  revoked_at: null,
  created_at: '2026-02-14T10:30:00.000Z',
};

// ── Member Role ──
export const memberRoleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    is_system: { type: 'boolean' },
    tone: { type: 'string', example: 'sky' },
    is_locked: {
      type: 'boolean',
      description:
        "Its codes never change (`PUT /tenancy/organization/roles/{role_id}/permissions` is a 403 `role_locked`) — Owner and Admin as a clinic is provisioned. Not the only fixed role: the role the organization's owner holds as their main role is a 403 `owner_role_fixed` whatever this says — it is the first of `role_ids` on the `is_owner` membership (USERS-M3)",
    },
    member_count: {
      type: 'integer',
      minimum: 0,
      description: 'Members (ACTIVE or INVITED) assigned this role in the organization.',
      example: 3,
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

export const memberRoleExample = {
  id: 'rol_m3n7p2q8w5k1r4t6a1b2c',
  name: 'Admin',
  description: 'Full access to all organization resources',
  is_system: true,
  tone: 'lav',
  is_locked: true,
  member_count: 3,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// ── Member Role Permission ──
export const memberRolePermissionSchema = {
  type: 'object',
  properties: {
    permission_code: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

export const memberRolePermissionExamples = [
  { permission_code: 'organization:read', created_at: '2026-01-01T00:00:00.000Z' },
  { permission_code: 'membership:read', created_at: '2026-01-01T00:00:00.000Z' },
  { permission_code: 'role:read', created_at: '2026-01-01T00:00:00.000Z' },
];

// ── Permission ──
export const permissionSchema = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    category: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

export const permissionExample = {
  code: 'organization:read',
  name: 'View Organization',
  description: null,
  category: 'tenancy',
  created_at: '2026-01-01T00:00:00.000Z',
};
