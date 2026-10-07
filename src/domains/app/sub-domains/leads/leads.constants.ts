/** Allowed values of `leads.status` — null only on a contact thread. */
export const LEAD_STATUS_VALUES = [
  'new',
  'contacted',
  'follow_up',
  'clinic_visited',
  'no_response',
  'not_interested',
  'invalid',
  'lost',
] as const;

/** Allowed values of `leads.source`. */
export const LEAD_SOURCE_VALUES = [
  'instagram',
  'google',
  'whatsapp',
  'facebook',
  'walk_in',
  'referral',
  'retarget',
] as const;

/** Allowed values of `leads.interests`. */
export const LEAD_INTERESTS_VALUES = [
  'others',
  'clinical',
  'peel',
  'lhr',
  'hydrafacial',
  'prp',
] as const;

/** Allowed values of `leads.kind`. */
export const LEAD_KIND_VALUES = ['enquiry', 'retarget', 'contact_thread'] as const;

/** Allowed values of `leads.default_channel`. */
export const LEAD_DEFAULT_CHANNEL_VALUES = [
  'whatsapp',
  'call',
  'sms',
  'instagram',
  'email',
  'note',
] as const;
