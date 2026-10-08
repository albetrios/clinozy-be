/** A day close's status (B25). */
export const DAY_CLOSE_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

/** Allowed values of `day_closes.status`. */
export const DAY_CLOSE_STATUS_VALUES = [DAY_CLOSE_STATUS.OPEN, DAY_CLOSE_STATUS.CLOSED] as const;

/** Where the opening cash came from (B25): the last close's count, or a recount. */
export const DAY_CLOSE_OPENING_SOURCE = {
  CARRIED: 'carried',
  RECOUNTED: 'recounted',
} as const;

/** Allowed values of `day_closes.opening_source`. */
export const DAY_CLOSE_OPENING_SOURCE_VALUES = [
  DAY_CLOSE_OPENING_SOURCE.CARRIED,
  DAY_CLOSE_OPENING_SOURCE.RECOUNTED,
] as const;

/** How a day was closed (B26): by a person, or by the auto-close worker. */
export const DAY_CLOSE_KIND = {
  MANUAL: 'manual',
  AUTO: 'auto',
} as const;

/** Allowed values of `day_closes.close_kind`. */
export const DAY_CLOSE_KIND_VALUES = [DAY_CLOSE_KIND.MANUAL, DAY_CLOSE_KIND.AUTO] as const;

/** What happened to a day (B27). */
export const DAY_CLOSE_EVENT_KIND = {
  OPENED: 'opened',
  RECOUNTED: 'recounted',
  CLOSED: 'closed',
  AUTO_CLOSED: 'auto_closed',
  REOPENED: 'reopened',
} as const;

/** Allowed values of `day_close_events.kind`. */
export const DAY_CLOSE_EVENT_KIND_VALUES = [
  DAY_CLOSE_EVENT_KIND.OPENED,
  DAY_CLOSE_EVENT_KIND.RECOUNTED,
  DAY_CLOSE_EVENT_KIND.CLOSED,
  DAY_CLOSE_EVENT_KIND.AUTO_CLOSED,
  DAY_CLOSE_EVENT_KIND.REOPENED,
] as const;

/** How far back a day can be opened (8.E.8 #29). */
export const DAY_CLOSE_BACKDATE_DAYS_MAX = 120;
