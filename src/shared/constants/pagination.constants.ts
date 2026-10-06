/** List pagination defaults and caps (cursor / keyset only). */

export const PAGINATION = {
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
  /**
   * Longest `after` cursor accepted. An encrypted cursor carrying the longest sort value (a
   * 255-character name) and the filter fingerprint is about 650 characters; anything far longer
   * was not minted here.
   */
  MAX_CURSOR_LENGTH: 1024,
} as const;

/**
 * Upper bound for opt-in `include_total` counts. An exact `count(*)` over a
 * filtered list scans every matching row, so on multi-million-row tables
 * (audit logs, notifications, delivery attempts) it can pin a connection and
 * inflate latency without bound. Counts stop at this cap: a returned total of
 * exactly {@link LIST_TOTAL_COUNT_CAP} means "at least this many" rather than an
 * exact figure, which is sufficient for a paged UI's "N+ results" affordance.
 */
export const LIST_TOTAL_COUNT_CAP = 10_000;
