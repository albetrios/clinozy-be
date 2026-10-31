# Worker changes — change-pharmacy-record-fields-2026-10-31-wpan

None. No queue, worker, cron, sweep or event changes: every new field is written inside the request
that already writes its record. The migration backfill of the old data (D12) is a one-off data
change run after this ships, not background work.
