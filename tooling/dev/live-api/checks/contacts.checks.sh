#!/usr/bin/env bash
# TEMPORARY — sub-domain 4, Contacts (routes-final §4.A–4.B, launch ROUTE #129): the contact and its
# numbers, the household rule, the one search, delete and restore, the preview, who handles the
# person, the gates by role. Sourced by run-live-api-checks.sh after live-api.sh; every name and
# number carries the run suffix.
S="${LIVE_API_RUN:-$(date +%s)}"
# This run's last name — `q=${T}` lists only this run's contacts.
T="z${S}"
# Ten-digit numbers unique to the run: 9 + the run's last 7 digits + two more.
N="9${S: -7}"
P1="+91${N}01"
P2="+91${N}02"
P3="+91${N}03"
P4="+91${N}04"
P5="+91${N}05"
NOWHERE_CONTACT=con_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_MEMBERSHIP=mem_aaaaaaaaaaaaaaaaaaaaa
NAMES='[.data[].first_name] | join(",")'
FIELDS='[.error.errors[].field] | join(",")'
TOMORROW="$(calendar_day 2)"

# contact FIRST PHONES_JSON [EXTRA_JSON] — a create body for this run.
contact() {
  local extra="${3:-}"
  [ -n "${extra}" ] || extra='{}'
  jq -nc --arg first "$1" --arg last "${T}" --argjson phones "$2" --argjson extra "${extra}" \
    '{first_name: $first, last_name: $last, phones: $phones} + $extra'
}
# one PHONE — a one-number `phones` set, primary.
one() { printf '[{"phone":"%s","is_primary":true}]' "$1"; }

# page_names PATH LIMIT — every page's first names, joined.
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

# ---- 4.A Contacts: create (route 2) -------------------------------------------------------------
expect 200 "create Riya (two numbers, tags)" POST /app/contacts "$(contact Riya \
  "[{\"phone\":\"${P2}\",\"is_on_whatsapp\":false},{\"phone\":\"${P1}\",\"is_primary\":true}]" \
  '{"gender":"female","date_of_birth":"1994-03-12","preference_tags":["no_calls","after_six_pm"],"email":"riya@example.com","instagram_handles":["riya.s"]}')"
RIYA="$(last '.data.id')"
RIYA_NUMBER="$(last '.data.contact_number')"
expect_value "create: primary_phone is the primary number (CT2)" '.data.primary_phone' "${P1}"
expect_value "create: phones, primary first" '[.data.phones[].phone] | join(",")' "${P1},${P2}"
expect_value "create: is_on_whatsapp kept" '.data.phones[1].is_on_whatsapp' false
expect_value "create: its own household (CT3)" '.data.household_contact_id == .data.id' true
expect_value "create: contact number assigned" '.data.contact_number > 0' true
expect_value "create: read-only fields null until #131–#133" '[.data.patient_id, .data.open_lead_id, .data.last_visit_on] | map(. == null) | all' true
NO_IDEMPOTENCY_KEY=1 expect 422 "create without X-Idempotency-Key" POST /app/contacts "$(contact Nokey "$(one "${P5}")")"
expect 400 "create without phones" POST /app/contacts "$(jq -nc --arg last "${T}" '{first_name: "Nophone", last_name: $last}')"
expect_value "create without phones: field" "${FIELDS}" body.phones
expect 400 "create with two primaries" POST /app/contacts "$(contact Two "[{\"phone\":\"${P5}\",\"is_primary\":true},{\"phone\":\"+91${N}06\",\"is_primary\":true}]")"
expect_value "two primaries: field" "${FIELDS}" body.phones
expect 400 "create with no primary" POST /app/contacts "$(contact None "[{\"phone\":\"${P5}\"}]")"
expect 400 "create with a number twice" POST /app/contacts "$(contact Twice "[{\"phone\":\"${P5}\",\"is_primary\":true},{\"phone\":\"${P5}\"}]")"
expect 400 "create with six numbers" POST /app/contacts "$(contact Six "$(jq -nc --arg n "${N}" '[range(0;6) | {phone: ("+91" + $n[0:8] + "7" + (. | tostring)), is_primary: (. == 0)}]')")"
expect 400 "create with a number not +91 and 10 digits" POST /app/contacts "$(contact Bad '[{"phone":"9876543210","is_primary":true}]')"
expect 409 "create with Riya's number, own household (CT3)" POST /app/contacts "$(contact Copy "$(one "${P1}")")"
expect_value "number clash: reason" '.error.reason' contact_phone_exists
expect_value "number clash: names the contact" "(.error.detail | contains(\"Riya ${T}\")) and (.error.detail | contains(\"C-${RIYA_NUMBER}\"))" true
ACCEPT_LANGUAGE=es expect 409 "number clash in Spanish" POST /app/contacts "$(contact Copy "$(one "${P1}")")"
expect_value "number clash: Spanish detail" '.error.detail | contains("ya pertenece")' true
expect 200 "create Aarav in Riya's household, sharing her number" POST /app/contacts "$(contact Aarav "$(one "${P1}")" "{\"household_contact_id\":\"${RIYA}\"}")"
AARAV="$(last '.data.id')"
expect_value "Aarav: Riya's household" '.data.household_contact_id' "${RIYA}"
expect 200 "create Kiaan in Aarav's household — normalized to its first contact" POST /app/contacts "$(contact Kiaan "$(one "${P1}")" "{\"household_contact_id\":\"${AARAV}\"}")"
KIAAN="$(last '.data.id')"
expect_value "Kiaan: Riya's household" '.data.household_contact_id' "${RIYA}"
expect 400 "create in an unknown household" POST /app/contacts "$(contact Lost "$(one "${P5}")" "{\"household_contact_id\":\"${NOWHERE_CONTACT}\"}")"
expect_value "unknown household: field" "${FIELDS}" household_contact_id
expect 400 "create with a tag not a lowercase key (CT14)" POST /app/contacts "$(contact Tag "$(one "${P5}")" '{"preference_tags":["No Calls"]}')"
expect_value "bad tag: field" "${FIELDS}" body.preference_tags/0
expect 400 "create with a repeated tag" POST /app/contacts "$(contact Tag "$(one "${P5}")" '{"preference_tags":["mornings","mornings"]}')"
expect 400 "create with 13 tags" POST /app/contacts "$(contact Tag "$(one "${P5}")" "$(jq -nc '{preference_tags: [range(0;13) | "tag_\(.)"]}')")"
expect 400 "create born in the future (CT13)" POST /app/contacts "$(contact Future "$(one "${P5}")" "{\"date_of_birth\":\"${TOMORROW}\"}")"
expect_value "future birth: field" "${FIELDS}" date_of_birth
expect 400 "create referred by a contact, source doctor (CT13)" POST /app/contacts "$(contact Ref "$(one "${P5}")" "{\"referral_source\":\"doctor\",\"referred_by_contact_id\":\"${RIYA}\"}")"
expect_value "referrer without patient: field" "${FIELDS}" referred_by_contact_id
expect 400 "create with an unknown field" POST /app/contacts "$(contact Odd "$(one "${P5}")" '{"language":"en"}')"
expect 200 "create Meera referred by Riya (source patient)" POST /app/contacts "$(contact Meera "$(one "${P3}")" "{\"referral_source\":\"patient\",\"referred_by_contact_id\":\"${RIYA}\",\"preference_tags\":[\"gujarati\"]}")"
MEERA="$(last '.data.id')"
expect_value "Meera: referred_by_contact_id" '.data.referred_by_contact_id' "${RIYA}"
expect 200 "create Aanya (email holds aarav)" POST /app/contacts "$(contact Aanya "$(one "${P4}")" "{\"email\":\"t${S}.aarav@example.com\",\"preference_tags\":[\"prefers_whatsapp\"]}")"
AANYA="$(last '.data.id')"

# ---- 4.A Contacts: read (route 3) -------------------------------------------------------------
expect 200 "get Riya" GET "/app/contacts/${RIYA}"
expect_value "get: phones" '.data.phones | length' 2
expect_value "get: not awaiting a reply" '.data.is_awaiting_reply' false
expect 404 "get unknown" GET "/app/contacts/${NOWHERE_CONTACT}"
expect 404 "get a non-contact id" GET "/app/contacts/brn_aaaaaaaaaaaaaaaaaaaaa"

# ---- 4.A Contacts: the list and the one search (route 1, CT8, CT9, CT12) ----------------------
IDS="${RIYA},${AARAV},${KIAAN},${MEERA},${AANYA}"
expect 200 "list this run (q = the run's last name)" GET "/app/contacts?q=${T}"
expect_value "list: by name" "${NAMES}" "Aanya,Aarav,Kiaan,Meera,Riya"
expect_value "list: total" '.meta.pagination.estimated_total' 5
expect_value "list: no phones on a list" '[.data[] | has("phones")] | any' false
expect_equal "list paged 2 by 2" "$(page_names "/app/contacts?q=${T}" 2)" "Aanya,Aarav,Kiaan,Meera,Riya"
expect 200 "search aarav: the name match first (best match)" GET "/app/contacts?q=aarav&ids=${IDS}"
expect_value "search aarav: Aarav before Aanya (email)" "${NAMES}" "Aarav,Aanya"
expect 200 "search aarav sorted newest first" GET "/app/contacts?q=aarav&ids=${IDS}&sort=created_at"
expect_value "search aarav by created_at" "${NAMES}" "Aanya,Aarav"
expect 400 "search two letters" GET "/app/contacts?q=ri"
expect_value "short search: field" "${FIELDS}" q
expect 400 "search three digits" GET "/app/contacts?q=981"
expect 200 "search a number's digits" GET "/app/contacts?q=${N}02"
expect_value "number digits: Riya" "${NAMES}" Riya
expect 200 "search a number as typed (+91 and spaces)" GET "/app/contacts?q=%2B91%20${N:0:5}%20${N:5}03"
expect_value "number as typed: Meera" "${NAMES}" Meera
expect 200 "search a whole contact number" GET "/app/contacts?q=C-${RIYA_NUMBER}"
expect_value "contact number: exactly Riya" "${NAMES}" Riya
expect 200 "search by email part" GET "/app/contacts?q=riya%40example&ids=${IDS}"
expect_value "email: Riya" "${NAMES}" Riya
expect 200 "phone filter: the household sharing it" GET "/app/contacts?phone=%2B91${N}01"
expect_value "phone filter: three of one household" "${NAMES}" "Aarav,Kiaan,Riya"
expect_equal "phone filter paged 1 by 1" "$(page_names "/app/contacts?phone=%2B91${N}01" 1)" "Aarav,Kiaan,Riya"
expect 400 "phone filter not +91" GET "/app/contacts?phone=12345"
expect 200 "ids filter" GET "/app/contacts?ids=${RIYA},${MEERA}"
expect_value "ids filter: two" "${NAMES}" "Meera,Riya"
TOO_MANY_IDS="$(for index in $(seq 1 101); do printf 'con_%021d,' "${index}"; done)"
expect 400 "ids filter over 100" GET "/app/contacts?ids=${TOO_MANY_IDS%,}"
expect 200 "household filter" GET "/app/contacts?household_contact_id=${RIYA}"
expect_value "household filter: Riya's" "${NAMES}" "Aarav,Kiaan,Riya"
expect 200 "household filter, unknown id: empty" GET "/app/contacts?household_contact_id=${NOWHERE_CONTACT}"
expect_value "unknown household: none" '.data | length' 0
expect 200 "tag filter (any of)" GET "/app/contacts?preference_tags=gujarati,no_calls&ids=${IDS}"
expect_value "tag filter: Meera, Riya" "${NAMES}" "Meera,Riya"
expect 200 "custom tag filter" GET "/app/contacts?preference_tags=prefers_whatsapp&ids=${IDS}"
expect_value "custom tag: Aanya" "${NAMES}" Aanya
expect 400 "tag filter not a key" GET "/app/contacts?preference_tags=No%20Calls"
expect 200 "is_patient=true matches none yet (D61)" GET "/app/contacts?is_patient=true&ids=${IDS}"
expect_value "is_patient=true: none" '.data | length' 0
expect 200 "has_open_lead=false matches all yet (D61)" GET "/app/contacts?has_open_lead=false&ids=${IDS}"
expect_value "has_open_lead=false: five" '.data | length' 5
expect 400 "sort=match is internal" GET "/app/contacts?sort=match"
compose_sql <<SQL
UPDATE app.contacts SET last_received_at = now(), last_activity_at = now() WHERE public_id = '${RIYA}';
UPDATE app.contacts SET last_sent_at = now(), last_received_at = now() - interval '1 hour',
  last_activity_at = now() - interval '1 hour' WHERE public_id = '${MEERA}';
SQL
expect 200 "awaiting a reply" GET "/app/contacts?is_awaiting_reply=true&ids=${IDS}"
expect_value "awaiting a reply: Riya" "${NAMES}" Riya
expect_value "awaiting a reply: flag" '.data[0].is_awaiting_reply' true
expect 200 "by recency (no activity last)" GET "/app/contacts?sort=last_activity_at&ids=${IDS}"
expect_value "by recency: newest, then no activity newest first" "${NAMES}" "Riya,Meera,Aanya,Kiaan,Aarav"
expect_equal "by recency paged 2 by 2" "$(page_names "/app/contacts?sort=last_activity_at&ids=${IDS}" 2)" "Riya,Meera,Aanya,Kiaan,Aarav"
expect 200 "by recency, oldest first" GET "/app/contacts?sort=last_activity_at&order=asc&ids=${IDS}"
expect_value "by recency asc" "${NAMES}" "Aarav,Kiaan,Aanya,Meera,Riya"

# ---- 4.A Contacts: change (route 4) -----------------------------------------------------------
expect 200 "get Riya before the change" GET "/app/contacts/${RIYA}"
UPDATED_AT="$(last '.data.updated_at')"
expect 200 "change Riya's tags" PATCH "/app/contacts/${RIYA}" "{\"preference_tags\":[\"evenings\"],\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 409 "stale save" PATCH "/app/contacts/${RIYA}" "{\"first_name\":\"Riyaa\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "stale save: record_changed" '.error.reason' record_changed
expect 400 "PATCH with only expected_updated_at" PATCH "/app/contacts/${RIYA}" "{\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 400 "PATCH an unknown field" PATCH "/app/contacts/${RIYA}" '{"kind":"lead"}'
expect 400 "PATCH born in the future" PATCH "/app/contacts/${RIYA}" "{\"date_of_birth\":\"${TOMORROW}\"}"
expect 200 "replace Riya's numbers (keep P2 only)" PATCH "/app/contacts/${RIYA}" "{\"phones\":[{\"phone\":\"${P2}\",\"is_primary\":true}]}"
expect_value "replaced: primary_phone follows" '.data.primary_phone' "${P2}"
expect_value "replaced: one number" '.data.phones | length' 1
expect 200 "search P1's digits after the replace" GET "/app/contacts?q=${N}01"
expect_value "P1 now: Aarav and Kiaan only" "${NAMES}" "Aarav,Kiaan"
expect 409 "give Meera the household's number (own household)" PATCH "/app/contacts/${MEERA}" "{\"phones\":[{\"phone\":\"${P3}\",\"is_primary\":true},{\"phone\":\"${P1}\"}]}"
expect_value "Meera clash: names Aarav or Kiaan" '.error.reason' contact_phone_exists
expect 200 "move Meera into the household via Aarav" PATCH "/app/contacts/${MEERA}" "{\"household_contact_id\":\"${AARAV}\"}"
expect_value "Meera: Riya's household" '.data.household_contact_id' "${RIYA}"
expect 200 "now Meera may share the household's number" PATCH "/app/contacts/${MEERA}" "{\"phones\":[{\"phone\":\"${P3}\",\"is_primary\":true},{\"phone\":\"${P1}\"}]}"
expect 400 "move Riya — the first of a household with others" PATCH "/app/contacts/${RIYA}" "{\"household_contact_id\":\"${AANYA}\"}"
expect_value "first of a household: field" "${FIELDS}" household_contact_id
expect 200 "name Riya's own household — no move" PATCH "/app/contacts/${RIYA}" "{\"household_contact_id\":\"${KIAAN}\"}"
expect 409 "Kiaan leaves the household but keeps the shared number" PATCH "/app/contacts/${KIAAN}" '{"household_contact_id":null}'
expect_value "leave with a shared number: reason" '.error.reason' contact_phone_exists
expect 200 "Kiaan leaves with a number of his own" PATCH "/app/contacts/${KIAAN}" "{\"household_contact_id\":null,\"phones\":[{\"phone\":\"${P5}\",\"is_primary\":true}]}"
expect_value "Kiaan: his own household" '.data.household_contact_id' "${KIAAN}"
expect 400 "Meera's source to doctor while she names a referrer" PATCH "/app/contacts/${MEERA}" '{"referral_source":"doctor"}'
expect 200 "clear the referrer with the source" PATCH "/app/contacts/${MEERA}" '{"referral_source":"doctor","referred_by_contact_id":null}'
expect 404 "PATCH unknown" PATCH "/app/contacts/${NOWHERE_CONTACT}" '{"first_name":"X"}'

# ---- 4.A Contacts: delete and restore (routes 5–6) ----------------------------------------------
expect 400 "delete without a reason" DELETE "/app/contacts/${AANYA}"
expect 400 "delete other without a note" DELETE "/app/contacts/${AANYA}?reason=other"
expect 204 "delete Aanya" DELETE "/app/contacts/${AANYA}?reason=duplicate"
expect 404 "get deleted" GET "/app/contacts/${AANYA}"
expect 404 "delete again" DELETE "/app/contacts/${AANYA}?reason=duplicate"
expect 200 "her number left with her" GET "/app/contacts?phone=%2B91${N}04"
expect_value "deleted number: no live contact" '.data | length' 0
expect 200 "Zoya takes the freed number" POST /app/contacts "$(contact Zoya "$(one "${P4}")")"
ZOYA="$(last '.data.id')"
expect 409 "restore Aanya — her number was taken meanwhile" POST "/app/contacts/${AANYA}/restore"
expect_value "restore clash: reason" '.error.reason' contact_phone_exists
expect_value "restore clash: names Zoya" '.error.detail | contains("Zoya")' true
expect 404 "Aanya is still deleted" GET "/app/contacts/${AANYA}"
expect 204 "delete Zoya" DELETE "/app/contacts/${ZOYA}?reason=mistake"
expect 200 "restore Aanya" POST "/app/contacts/${AANYA}/restore"
expect_value "restored with her number" '[.data.phones[].phone] | join(",")' "${P4}"
expect 200 "her number is live again" GET "/app/contacts?phone=%2B91${N}04"
expect_value "restored number: Aanya" "${NAMES}" Aanya
expect 409 "restore a live contact" POST "/app/contacts/${AANYA}/restore"
expect_value "restore live: record_not_deleted" '.error.reason' record_not_deleted
expect 404 "restore unknown" POST "/app/contacts/${NOWHERE_CONTACT}/restore"

# ---- 4.A Contacts: the hover card (route 7) -----------------------------------------------------
expect 200 "preview Riya" GET "/app/contacts/${RIYA}/preview"
expect_value "preview: no phones" '.data | has("phones")' false
expect_value "preview: primary_phone" '.data.primary_phone' "${P2}"
expect_value "preview: lead, patient, appointments null (D61)" '[.data.open_lead, .data.patient, .data.next_appointment, .data.last_appointment] | map(. == null) | all' true
expect 404 "preview unknown" GET "/app/contacts/${NOWHERE_CONTACT}/preview"
expect 404 "preview deleted" GET "/app/contacts/${ZOYA}/preview"

# ---- 4.B Contact members (routes 8–9, CT11) -----------------------------------------------------
DOCTOR="$(fixture '.members.doctor.membership_id')"
FRONT_DESK="$(fixture '.members.front_desk.membership_id')"
expect 200 "members of a new contact" GET "/app/contacts/${RIYA}/members"
expect_value "members: none yet" '.data | length' 0
expect 200 "set who handles Riya" PUT "/app/contacts/${RIYA}/members" "{\"membership_ids\":[\"${DOCTOR}\",\"${FRONT_DESK}\"]}"
expect_value "set members: two" '.data | length' 2
expect 200 "the contact lists them" GET "/app/contacts/${RIYA}"
expect_value "member_membership_ids" '.data.member_membership_ids | length' 2
expect 200 "my people: member filter" GET "/app/contacts?member_membership_id=${DOCTOR}&ids=${IDS}"
expect_value "member filter: Riya" "${NAMES}" Riya
expect 200 "member filter, unknown member: empty" GET "/app/contacts?member_membership_id=${NOWHERE_MEMBERSHIP}"
expect_value "unknown member: none" '.data | length' 0
expect 400 "members: an unknown team member" PUT "/app/contacts/${RIYA}/members" "{\"membership_ids\":[\"${NOWHERE_MEMBERSHIP}\"]}"
expect_value "unknown member: field" "${FIELDS}" membership_ids
expect 400 "members: one twice" PUT "/app/contacts/${RIYA}/members" "{\"membership_ids\":[\"${DOCTOR}\",\"${DOCTOR}\"]}"
expect 400 "members: no list" PUT "/app/contacts/${RIYA}/members" '{}'
expect 200 "members: keep the doctor only" PUT "/app/contacts/${RIYA}/members" "{\"membership_ids\":[\"${DOCTOR}\"]}"
expect_value "keep the doctor: one" '[.data[].membership_id] | join(",")' "${DOCTOR}"
expect 200 "members: none" PUT "/app/contacts/${RIYA}/members" '{"membership_ids":[]}'
expect_value "members: emptied" '.data | length' 0
expect 404 "members of a deleted contact" GET "/app/contacts/${ZOYA}/members"
expect 404 "set members of an unknown contact" PUT "/app/contacts/${NOWHERE_CONTACT}/members" '{"membership_ids":[]}'

# ---- Gates by role (CT5: read for every role, write for all but the Accountant) ----------------
as_role accountant
expect 200 "accountant: list" GET "/app/contacts?q=${T}"
expect 200 "accountant: preview" GET "/app/contacts/${RIYA}/preview"
expect 200 "accountant: members" GET "/app/contacts/${RIYA}/members"
expect 403 "accountant: create" POST /app/contacts "$(contact Acc "$(one "+91${N}08")")"
expect 403 "accountant: change" PATCH "/app/contacts/${RIYA}" '{"first_name":"Riya"}'
expect 403 "accountant: set members" PUT "/app/contacts/${RIYA}/members" '{"membership_ids":[]}'
as_role front_desk
expect 200 "front desk: create" POST /app/contacts "$(contact Desk "$(one "+91${N}09")")"
DESK="$(last '.data.id')"
expect 200 "front desk: set members" PUT "/app/contacts/${DESK}/members" "{\"membership_ids\":[\"${FRONT_DESK}\"]}"
expect 403 "front desk: delete" DELETE "/app/contacts/${DESK}?reason=mistake"
expect 403 "front desk: restore" POST "/app/contacts/${AANYA}/restore"
as_role marketing
expect 200 "marketing: change" PATCH "/app/contacts/${DESK}" '{"has_marketing_consent":true}'
as_role admin
expect 204 "admin: delete" DELETE "/app/contacts/${DESK}?reason=mistake"
as_role owner
