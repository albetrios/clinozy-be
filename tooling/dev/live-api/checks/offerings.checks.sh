#!/usr/bin/env bash
# TEMPORARY — sub-domain 3, Offerings (routes-final §3, launch ROUTE #128): 3.A groups, 3.B
# offerings, 3.C offers, the gates by role, the saved-view filters. Sourced by
# run-live-api-checks.sh after live-api.sh; every name carries the run suffix.
S="${LIVE_API_RUN:-$(date +%s)}"
VESU="$(fixture '.branches.vesu')"
ADAJAN="$(fixture '.branches.adajan')"
NOWHERE_BRANCH=brn_aaaaaaaaaaaaaaaaaaaaa
# The names of the last list page, without this run's suffix.
NAMES="[.data[].name | rtrimstr(\" ${S}\")] | join(\",\")"
FIELDS='[.error.errors[].field] | join(",")'

# page_names PATH LIMIT — every page's names, joined.
page_names() {
  local after="" all=""
  while :; do
    api GET "$1&limit=$2${after:+&after=${after}}" >/dev/null
    all+="$(last "${NAMES}"),"
    after="$(last '.meta.pagination.next // empty')"
    [ -n "${after}" ] || break
  done
  printf '%s' "${all%,}"
}

as_role owner

# ---- 3.A Offering groups (routes 1–6) -------------------------------------------------------
expect 200 "group create Laser (20)" POST /app/offering-groups "{\"name\":\"Laser ${S}\",\"sort_order\":20}"
expect 200 "group create Facials (10)" POST /app/offering-groups "{\"name\":\"Facials ${S}\",\"sort_order\":10}"
expect 200 "group create Peels (10)" POST /app/offering-groups "{\"name\":\"Peels ${S}\",\"sort_order\":10}"
PEELS="$(last '.data.id')"
expect 200 "group create Hair (0)" POST /app/offering-groups "{\"name\":\"Hair ${S}\",\"sort_order\":0}"
HAIR="$(last '.data.id')"
expect 409 "group name taken in another case" POST /app/offering-groups "{\"name\":\"LASER ${S}\"}"
expect 400 "group sort_order 10000" POST /app/offering-groups "{\"name\":\"Big ${S}\",\"sort_order\":10000}"
NO_IDEMPOTENCY_KEY=1 expect 422 "group create without X-Idempotency-Key" POST /app/offering-groups "{\"name\":\"Nokey ${S}\"}"
expect 200 "group list" GET "/app/offering-groups?q=${S}"
expect_value "group list: menu order (O8)" "${NAMES}" "Hair,Facials,Peels,Laser"
expect_value "group list: total" '.meta.pagination.estimated_total' 4
expect 200 "group list desc" GET "/app/offering-groups?q=${S}&sort=sort_order&order=desc"
expect_value "group list desc: both keys flip" "${NAMES}" "Laser,Peels,Facials,Hair"
expect 200 "group list by name" GET "/app/offering-groups?q=${S}&sort=name&order=asc"
expect_value "group list by name" "${NAMES}" "Facials,Hair,Laser,Peels"
expect_equal "group list paged 1 by 1 across the sort_order tie" "$(page_names "/app/offering-groups?q=${S}" 1)" "Hair,Facials,Peels,Laser"
expect 200 "group get" GET "/app/offering-groups/${PEELS}"
UPDATED_AT="$(last '.data.updated_at')"
expect 404 "group get unknown" GET /app/offering-groups/ogr_aaaaaaaaaaaaaaaaaaaaa
expect 200 "group reorder" PATCH "/app/offering-groups/${PEELS}" "{\"sort_order\":5,\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 409 "group stale save" PATCH "/app/offering-groups/${PEELS}" "{\"name\":\"Chem ${S}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "group stale save: record_changed" '.error.reason' record_changed
expect 409 "group rename onto another group's name" PATCH "/app/offering-groups/${PEELS}" "{\"name\":\"hair ${S}\"}"
expect 400 "group PATCH with only expected_updated_at" PATCH "/app/offering-groups/${PEELS}" "{\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 400 "group PATCH unknown field" PATCH "/app/offering-groups/${PEELS}" '{"tone":"sky"}'
expect 400 "group delete without reason" DELETE "/app/offering-groups/${HAIR}"
expect 400 "group delete other without note" DELETE "/app/offering-groups/${HAIR}?reason=other"
expect 204 "group delete (empty)" DELETE "/app/offering-groups/${HAIR}?reason=not_needed"
expect 404 "group get deleted" GET "/app/offering-groups/${HAIR}"
expect 404 "group delete again" DELETE "/app/offering-groups/${HAIR}?reason=not_needed"
expect 200 "group create takes the deleted name" POST /app/offering-groups "{\"name\":\"Hair ${S}\",\"sort_order\":1}"
HAIR_AGAIN="$(last '.data.id')"
expect 409 "group restore over a reused name" POST "/app/offering-groups/${HAIR}/restore"
expect_value "group restore over a reused name: record_restore_conflict" '.error.reason' record_restore_conflict
expect 204 "group delete the new one" DELETE "/app/offering-groups/${HAIR_AGAIN}?reason=duplicate"
expect 200 "group restore" POST "/app/offering-groups/${HAIR}/restore"
expect 409 "group restore a live group" POST "/app/offering-groups/${HAIR}/restore"
expect_value "group restore a live group: record_not_deleted" '.error.reason' record_not_deleted

# ---- 3.B Offerings (routes 7–13) ------------------------------------------------------------
expect 200 "offering create consultation" POST /app/offerings "{\"name\":\"Skin consultation ${S}\",\"category\":\"consultation\",\"price\":500}"
expect_value "offering consultation: GST 0, lowest 0, no offer price, every branch" '[.data.gst_percent, .data.min_price, .data.offer_price, (.data.branch_ids|length)] | map(tostring) | join(",")' "0,0,null,0"
CONSULTATION="$(last '.data.id')"
expect 200 "offering create peel at Vesu in Peels" POST /app/offerings "{\"name\":\"Glycolic peel ${S}\",\"price\":3000,\"offer_price\":2500,\"min_price\":2000,\"offering_group_id\":\"${PEELS}\",\"branch_ids\":[\"${VESU}\"],\"search_terms\":[\"chemical peel\",\"glow${S}\"],\"sessions\":4,\"validity_days\":180}"
expect_value "offering peel: GST 18 by default" '.data.gst_percent' 18
expect_value "offering peel: group and branch" '[.data.offering_group_id, .data.branch_ids[0]] | join(",")' "${PEELS},${VESU}"
PEEL="$(last '.data.id')"
PEEL_NUMBER="$(last '.data.offering_number')"
expect 200 "offering create laser at Adajan" POST /app/offerings "{\"name\":\"Laser hair reduction ${S}\",\"category\":\"lhr\",\"price\":6000,\"branch_ids\":[\"${ADAJAN}\"],\"search_terms\":[\"lhr${S}\"]}"
LASER="$(last '.data.id')"
expect 400 "O4 offer price above price" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":100,\"offer_price\":120}"
expect_value "O4 offer price above price: field" "${FIELDS}" offer_price
expect 400 "O4 lowest above offer price" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":100,\"offer_price\":80,\"min_price\":90}"
expect_value "O4 lowest above offer price: field" "${FIELDS}" min_price
expect 400 "O4 lowest above price (no offer price)" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":100,\"min_price\":150}"
expect_value "O4 lowest above price: message" '.error.errors[0].message' "The lowest price can't be above the price"
ACCEPT_LANGUAGE=es expect 400 "O4 in Spanish" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":100,\"offer_price\":120}"
expect_value "O4 in Spanish: message" '.error.errors[0].message' "El precio de oferta no puede superar el precio"
expect 400 "O4 on the merged PATCH row (price below offer price)" PATCH "/app/offerings/${PEEL}" '{"price":2400}'
expect_value "O4 merged row: field" "${FIELDS}" offer_price
expect 400 "O4 PATCH offer price below lowest" PATCH "/app/offerings/${PEEL}" '{"offer_price":1500}'
expect_value "O4 PATCH offer price below lowest: field" "${FIELDS}" min_price
expect 200 "offering PATCH the three prices together" PATCH "/app/offerings/${PEEL}" '{"price":2800,"offer_price":2200,"min_price":1800}'
expect 409 "offering name taken in another case" POST /app/offerings "{\"name\":\"GLYCOLIC PEEL ${S}\",\"price\":1}"
expect 400 "offering unknown group" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":1,\"offering_group_id\":\"ogr_aaaaaaaaaaaaaaaaaaaaa\"}"
expect_value "offering unknown group: field" "${FIELDS}" offering_group_id
expect 400 "offering unknown branch" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":1,\"branch_ids\":[\"${NOWHERE_BRANCH}\"]}"
expect 400 "offering default_room_id gone (O6)" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":1,\"default_room_id\":null}"
expect 400 "offering group_id renamed (O1)" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":1,\"group_id\":null}"
expect 400 "offering a branch twice" POST /app/offerings "{\"name\":\"Bad ${S}\",\"price\":1,\"branch_ids\":[\"${VESU}\",\"${VESU}\"]}"
expect 200 "offering list" GET "/app/offerings?q=${S}"
expect_value "offering list: newest first" "${NAMES}" "Laser hair reduction,Glycolic peel,Skin consultation"
expect 200 "offering q by #number" GET "/app/offerings?q=%23${PEEL_NUMBER}"
expect_value "offering q by #number" '.data[0].id' "${PEEL}"
expect 200 "offering q by search term (O9)" GET "/app/offerings?q=glow${S}"
expect_value "offering q by search term" "${NAMES}" "Glycolic peel"
expect 200 "offering branch Vesu (O5)" GET "/app/offerings?q=${S}&branch_id=${VESU}&sort=name&order=asc"
expect_value "offering branch Vesu: Vesu and every-branch" "${NAMES}" "Glycolic peel,Skin consultation"
expect 200 "offering branch Adajan" GET "/app/offerings?q=${S}&branch_id=${ADAJAN}&sort=name&order=asc"
expect_value "offering branch Adajan" "${NAMES}" "Laser hair reduction,Skin consultation"
expect 200 "offering unknown branch filter" GET "/app/offerings?q=${S}&branch_id=${NOWHERE_BRANCH}"
expect_value "offering unknown branch filter: empty" '.meta.pagination.estimated_total' 0
expect 200 "offering group filter" GET "/app/offerings?q=${S}&offering_group_id=${PEELS}"
expect_value "offering group filter" "${NAMES}" "Glycolic peel"
expect 400 "offering old group_id filter" GET "/app/offerings?group_id=${PEELS}"
expect 200 "offering branch_ids [] = every branch" PATCH "/app/offerings/${LASER}" '{"branch_ids":[]}'
expect 200 "offering branch Vesu now holds the laser" GET "/app/offerings?q=${S}&branch_id=${VESU}"
expect_value "offering branch Vesu: three" '.meta.pagination.estimated_total' 3
expect 200 "offering back to Adajan" PATCH "/app/offerings/${LASER}" "{\"branch_ids\":[\"${ADAJAN}\"]}"
expect 409 "O7 group delete while an offering uses it" DELETE "/app/offering-groups/${PEELS}?reason=not_needed"
expect_value "O7 message" '.error.detail' "This group still has offerings — move or ungroup them first"
expect 200 "offering deactivate" PATCH "/app/offerings/${CONSULTATION}" '{"is_active":false}'
expect 200 "offering is_active filter" GET "/app/offerings?q=${S}&is_active=true"
expect_value "offering is_active filter: two" '.meta.pagination.estimated_total' 2
expect 204 "offering delete" DELETE "/app/offerings/${PEEL}?reason=mistake"
expect 404 "offering get deleted" GET "/app/offerings/${PEEL}"
expect 204 "O7 group delete once empty" DELETE "/app/offering-groups/${PEELS}?reason=mistake"
expect 200 "group restore" POST "/app/offering-groups/${PEELS}/restore"
expect 200 "offering restore" POST "/app/offerings/${PEEL}/restore"
expect 409 "offering restore a live one" POST "/app/offerings/${PEEL}/restore"
expect 200 "offering export ignores limit (O14)" GET "/app/offerings/exports?q=${S}&limit=1"
expect_value "offering export: rows and file" '[.data.row_count, (.data.file_name | startswith("offerings-"))] | map(tostring) | join(",")' "3,true"

# ---- 3.C Offers (routes 14–19) --------------------------------------------------------------
TODAY="$(calendar_day 0)"
PAST="$(calendar_day -30)"
YESTERDAY="$(calendar_day -1)"
SOON="$(calendar_day 10)"
LATER="$(calendar_day 40)"
CODE="glow${S: -6}"
CODE_UPPER="$(printf '%s' "${CODE}" | tr '[:lower:]' '[:upper:]')"
expect 200 "offer create live" POST /app/offers "{\"name\":\"Navratri glow ${S}\",\"code\":\"${CODE}\",\"value\":20,\"offering_ids\":[\"${PEEL}\"],\"starts_on\":\"${PAST}\",\"ends_on\":\"${SOON}\"}"
expect_value "offer live: status and code stored upper" '[.data.status, .data.code] | join(",")' "live,${CODE_UPPER}"
LIVE="$(last '.data.id')"
expect 200 "offer create scheduled at Adajan" POST /app/offers "{\"name\":\"Diwali laser ${S}\",\"kind\":\"amount\",\"value\":1000,\"offering_ids\":[\"${LASER}\"],\"branch_ids\":[\"${ADAJAN}\"],\"starts_on\":\"${SOON}\",\"ends_on\":\"${LATER}\"}"
expect_value "offer scheduled" '.data.status' scheduled
SCHEDULED="$(last '.data.id')"
expect 200 "offer create paused" POST /app/offers "{\"name\":\"Peel extra ${S}\",\"kind\":\"extra\",\"value\":1,\"offering_ids\":[\"${PEEL}\"],\"is_active\":false}"
expect_value "offer paused" '.data.status' paused
expect 200 "offer create ended at Vesu" POST /app/offers "{\"name\":\"Monsoon fixed ${S}\",\"kind\":\"fixed\",\"value\":1999.5,\"offering_ids\":[\"${PEEL}\"],\"branch_ids\":[\"${VESU}\"],\"starts_on\":\"${PAST}\",\"ends_on\":\"${YESTERDAY}\"}"
expect_value "offer ended" '.data.status' ended
expect 200 "offer create dateless" POST /app/offers "{\"name\":\"Always on ${S}\",\"value\":5,\"offering_ids\":[\"${PEEL}\",\"${LASER}\"]}"
expect_value "offer dateless is live" '.data.status' live
ALWAYS="$(last '.data.id')"
expect 409 "O11 code in use, any case" POST /app/offers "{\"name\":\"Dup ${S}\",\"code\":\"${CODE_UPPER}\",\"value\":10,\"offering_ids\":[\"${PEEL}\"]}"
expect 400 "O11 code with a dash" POST /app/offers "{\"name\":\"Bad ${S}\",\"code\":\"GLOW-20\",\"value\":10,\"offering_ids\":[\"${PEEL}\"]}"
expect 400 "O11 code of 17" POST /app/offers "{\"name\":\"Bad ${S}\",\"code\":\"ABCDEFGHIJKLMNOPQ\",\"value\":10,\"offering_ids\":[\"${PEEL}\"]}"
for value in 0 101 12.5; do
  expect 400 "O11 percent ${value}" POST /app/offers "{\"name\":\"Bad ${S}\",\"value\":${value},\"offering_ids\":[\"${PEEL}\"]}"
done
expect 400 "O11 amount 0" POST /app/offers "{\"name\":\"Bad ${S}\",\"kind\":\"amount\",\"value\":0,\"offering_ids\":[\"${PEEL}\"]}"
for value in 100 1.5; do
  expect 400 "O11 extra ${value}" POST /app/offers "{\"name\":\"Bad ${S}\",\"kind\":\"extra\",\"value\":${value},\"offering_ids\":[\"${PEEL}\"]}"
done
expect_value "O11 extra: field" "${FIELDS}" value
expect 400 "offer ends before it starts" POST /app/offers "{\"name\":\"Bad ${S}\",\"value\":5,\"offering_ids\":[\"${PEEL}\"],\"starts_on\":\"${SOON}\",\"ends_on\":\"${TODAY}\"}"
expect_value "offer ends before it starts: field" "${FIELDS}" ends_on
expect 400 "O12 inactive offering" POST /app/offers "{\"name\":\"Bad ${S}\",\"value\":5,\"offering_ids\":[\"${CONSULTATION}\"]}"
expect_value "O12 message" '.error.errors[0].message' "${CONSULTATION} is not an active offering of this organization"
ACCEPT_LANGUAGE=es expect 400 "O12 in Spanish" POST /app/offers "{\"name\":\"Bad ${S}\",\"value\":5,\"offering_ids\":[\"${CONSULTATION}\"]}"
expect_value "O12 in Spanish: message" '.error.errors[0].message' "${CONSULTATION} no es un servicio activo de esta organización"
expect 400 "offer unknown offering" POST /app/offers "{\"name\":\"Bad ${S}\",\"value\":5,\"offering_ids\":[\"off_aaaaaaaaaaaaaaaaaaaaa\"]}"
expect 400 "offer unknown branch" POST /app/offers "{\"name\":\"Bad ${S}\",\"value\":5,\"offering_ids\":[\"${PEEL}\"],\"branch_ids\":[\"${NOWHERE_BRANCH}\"]}"
expect 400 "offer no offerings" POST /app/offers "{\"name\":\"Bad ${S}\",\"value\":5,\"offering_ids\":[]}"
expect 400 "offer is_paused gone (O10)" POST /app/offers "{\"name\":\"Bad ${S}\",\"value\":5,\"offering_ids\":[\"${PEEL}\"],\"is_paused\":true}"
expect 200 "offer list" GET "/app/offers?q=${S}"
expect_value "offer list: Live → Scheduled → Paused → Ended, newest first (O10)" "${NAMES}" "Always on,Navratri glow,Diwali laser,Peel extra,Monsoon fixed"
expect 200 "offer list desc" GET "/app/offers?q=${S}&order=desc"
expect_value "offer list desc" '[.data[].status] | join(",")' "ended,paused,scheduled,live,live"
expect_equal "offer list paged 2 by 2 (mixed directions)" "$(page_names "/app/offers?q=${S}" 2)" "Always on,Navratri glow,Diwali laser,Peel extra,Monsoon fixed"
for status_count in live:2 scheduled:1 paused:1 ended:1; do
  expect 200 "offer status=${status_count%%:*}" GET "/app/offers?q=${S}&status=${status_count%%:*}"
  expect_value "offer status=${status_count%%:*}: count" '.meta.pagination.estimated_total' "${status_count##*:}"
done
expect 400 "offer status in capitals" GET "/app/offers?status=LIVE"
expect 200 "offer kind=amount" GET "/app/offers?q=${S}&kind=amount"
expect_value "offer kind=amount" "${NAMES}" "Diwali laser"
expect 200 "offer offering_id" GET "/app/offers?q=${S}&offering_id=${LASER}"
expect_value "offer offering_id" "${NAMES}" "Always on,Diwali laser"
expect 200 "offer branch Vesu (O5)" GET "/app/offers?q=${S}&branch_id=${VESU}"
expect_value "offer branch Vesu: four" '.meta.pagination.estimated_total' 4
expect 200 "offer sort=starts_on" GET "/app/offers?q=${S}&sort=starts_on"
expect_value "offer sort=starts_on keeps dateless offers, last" "${NAMES}" "Diwali laser,Monsoon fixed,Navratri glow,Always on,Peel extra"
expect_equal "offer sort=starts_on paged 2 by 2" "$(page_names "/app/offers?q=${S}&sort=starts_on" 2)" "Diwali laser,Monsoon fixed,Navratri glow,Always on,Peel extra"
expect 200 "offer starts_on_from today" GET "/app/offers?q=${S}&starts_on_from=${TODAY}"
expect_value "offer starts_on_from today" "${NAMES}" "Diwali laser"
expect 200 "offer q by code" GET "/app/offers?q=${CODE}"
expect_value "offer q by code" "${NAMES}" "Navratri glow"
expect 200 "offer get" GET "/app/offers/${LIVE}"
UPDATED_AT="$(last '.data.updated_at')"
expect 200 "offer pause" PATCH "/app/offers/${LIVE}" "{\"is_active\":false,\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "offer pause: paused" '.data.status' paused
expect 409 "offer stale save" PATCH "/app/offers/${LIVE}" "{\"name\":\"Stale ${S}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 200 "offer resume" PATCH "/app/offers/${LIVE}" '{"is_active":true}'
expect_value "offer resume: live" '.data.status' live
expect 200 "offer kind change keeps a fitting value" PATCH "/app/offers/${LIVE}" '{"kind":"extra"}'
expect 400 "offer kind change to a value out of range" PATCH "/app/offers/${LIVE}" '{"kind":"percent","value":150}'
expect 200 "offer back to 20%" PATCH "/app/offers/${LIVE}" '{"kind":"percent","value":20}'
expect 400 "offer PATCH end before the kept start" PATCH "/app/offers/${SCHEDULED}" '{"ends_on":"2026-01-01"}'
expect 409 "offer PATCH a code another live offer has" PATCH "/app/offers/${ALWAYS}" "{\"code\":\"${CODE}\"}"
expect 400 "offer PATCH an inactive offering" PATCH "/app/offers/${ALWAYS}" "{\"offering_ids\":[\"${CONSULTATION}\"]}"
expect 200 "offer PATCH clears the code" PATCH "/app/offers/${ALWAYS}" '{"code":null}'
expect 400 "offer PATCH empty body" PATCH "/app/offers/${ALWAYS}" '{}'
expect 400 "offer delete without reason" DELETE "/app/offers/${LIVE}"
expect 204 "offer delete" DELETE "/app/offers/${LIVE}?reason=duplicate"
expect 404 "offer get deleted" GET "/app/offers/${LIVE}"
expect 200 "offer create takes the freed code" POST /app/offers "{\"name\":\"Glow again ${S}\",\"code\":\"${CODE}\",\"value\":15,\"offering_ids\":[\"${PEEL}\"]}"
GLOW_AGAIN="$(last '.data.id')"
expect 409 "offer restore over a reused code" POST "/app/offers/${LIVE}/restore"
expect_value "offer restore over a reused code: record_restore_conflict" '.error.reason' record_restore_conflict
expect 204 "offer delete the new one" DELETE "/app/offers/${GLOW_AGAIN}?reason=mistake"
expect 200 "offer restore" POST "/app/offers/${LIVE}/restore"
expect 409 "offer restore a live one" POST "/app/offers/${LIVE}/restore"

# ---- Gates by role (3.4) --------------------------------------------------------------------
as_role counsellor
expect 200 "counsellor reads groups" GET "/app/offering-groups?q=${S}"
expect 200 "counsellor reads offers" GET "/app/offers?q=${S}"
expect 200 "counsellor reads an offering" GET "/app/offerings/${PEEL}"
expect_value "counsellor: min_price hidden (O15)" '.data.min_price' null
expect 403 "counsellor export" GET /app/offerings/exports
expect 200 "counsellor creates a group" POST /app/offering-groups "{\"name\":\"Counsellor ${S}\"}"
expect 200 "counsellor creates an offering" POST /app/offerings "{\"name\":\"Counsellor ${S}\",\"price\":100}"
expect 200 "counsellor creates an offer" POST /app/offers "{\"name\":\"Counsellor ${S}\",\"value\":5,\"offering_ids\":[\"${PEEL}\"]}"
expect 200 "counsellor changes a price (O3)" PATCH "/app/offerings/${PEEL}" '{"price":2900}'
expect 200 "counsellor pauses an offer" PATCH "/app/offers/${ALWAYS}" '{"is_active":true}'
expect 403 "counsellor deletes a group" DELETE "/app/offering-groups/${HAIR}?reason=mistake"
expect 403 "counsellor deletes an offering" DELETE "/app/offerings/${CONSULTATION}?reason=mistake"
expect 403 "counsellor deletes an offer" DELETE "/app/offers/${ALWAYS}?reason=mistake"
as_role accountant
expect 200 "accountant reads an offering" GET "/app/offerings/${PEEL}"
expect_value "accountant: min_price shown" '.data.min_price' 1800
expect 200 "accountant export" GET "/app/offerings/exports?q=${S}"
expect 403 "accountant creates" POST /app/offerings "{\"name\":\"Accountant ${S}\",\"price\":100}"
expect 403 "accountant changes" PATCH "/app/offerings/${PEEL}" '{"price":2900}'
as_role doctor
expect 200 "doctor export (O14)" GET "/app/offerings/exports?q=${S}"
expect_value "doctor export: lowest price blank in every row" '(.data.content | split("\r\n")) as $lines | ($lines[0] | split(",") | index("min_price")) as $column | [$lines[1:][] | select(length > 0) | split(",")[$column]] | unique | join("|")' ""
expect 403 "doctor creates a group" POST /app/offering-groups "{\"name\":\"Doctor ${S}\"}"
as_role front_desk
expect 200 "front desk reads offerings" GET "/app/offerings?q=${S}"
expect_value "front desk: min_price hidden" '[.data[].min_price] | unique | map(tostring) | join(",")' null
expect 403 "front desk export" GET /app/offerings/exports
expect 403 "front desk creates an offer" POST /app/offers "{\"name\":\"Desk ${S}\",\"value\":5,\"offering_ids\":[\"${PEEL}\"]}"

# ---- Saved views take the offerings list's filters (UC5) ------------------------------------
as_role owner
expect 200 "saved view with offering_group_id and branch_id" POST /app/memberships/me/saved-views "{\"list_key\":\"offerings\",\"label\":\"Vesu peels ${S}\",\"filters\":{\"offering_group_id\":\"${PEELS}\",\"branch_id\":\"${VESU}\",\"q\":\"peel\"}}"
expect 400 "saved view with the old group_id" POST /app/memberships/me/saved-views "{\"list_key\":\"offerings\",\"label\":\"Old ${S}\",\"filters\":{\"group_id\":\"${PEELS}\"}}"
