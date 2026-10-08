#!/usr/bin/env bash
# TEMPORARY — sub-domain 5, Leads (routes-final §5, launch ROUTE #131): a lead for a contact or with
# a new one, one open lead per contact, the list's search, filters and sorts, the owner's hold,
# claim and release, `clinic_visited`, delete and restore, the export, what the contact and its
# stream read and move, the gates by role. Sourced by run-live-api-checks.sh after live-api.sh;
# every name and number carries the run suffix.
S="${LIVE_API_RUN:-$(date +%s)}"
# This run's last name — `q=${T}` lists only this run's leads (through their contacts).
T="x${S}"
# Ten-digit numbers unique to the run: 7 + the run's last 7 digits + two more.
N="7${S: -7}"
NOWHERE_CONTACT=con_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_LEAD=lead_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_MEMBERSHIP=mem_aaaaaaaaaaaaaaaaaaaaa
FIELDS='[.error.errors[].field] | join(",")'
NAMES='[.data[].contact.first_name] | join(",")'
VESU="$(fixture '.branches.vesu')"
ADAJAN="$(fixture '.branches.adajan')"
ADMIN="$(fixture '.members.admin.membership_id')"
DOCTOR="$(fixture '.members.doctor.membership_id')"
FRONT_DESK="$(fixture '.members.front_desk.membership_id')"
MARKETING="$(fixture '.members.marketing.membership_id')"

# person FIRST SUFFIX — a contact of this run with its own number; sets LAST_CONTACT.
person() {
  expect 200 "contact $1" POST /app/contacts "$(jq -nc --arg first "$1" --arg last "${T}" --arg phone "+91${N}$2" \
    '{first_name: $first, last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
  LAST_CONTACT="$(last '.data.id')"
}

# page_names PATH LIMIT — every page's contact first names, joined.
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

# lead_sql SQL — runs one statement in the Compose database (a state the API never writes).
lead_sql() { compose_sql <<<"$1" >/dev/null; }

as_role owner
person Riya 01
RIYA="${LAST_CONTACT}"
person Meera 02
MEERA="${LAST_CONTACT}"
person Neel 03
NEEL="${LAST_CONTACT}"

# ---- Create (route 3) ---------------------------------------------------------------------------
expect 200 "create Riya's lead (owner, involved, branch)" POST /app/leads \
  "{\"contact_id\":\"${RIYA}\",\"source\":\"instagram\",\"interests\":[\"lhr\",\"hydrafacial\"],\"owner_membership_id\":\"${DOCTOR}\",\"involved_membership_ids\":[\"${FRONT_DESK}\"],\"branch_id\":\"${VESU}\",\"notes\":\"Asked on Instagram\"}"
RIYA_LEAD="$(last '.data.id')"
RIYA_LEAD_NUMBER="$(last '.data.lead_number')"
expect_value "create: status new, kind enquiry" '[.data.status, .data.kind] | join(",")' new,enquiry
expect_value "create: the contact summary (L1)" '[.data.contact_id, .data.contact.id, .data.contact.first_name] | join(",")' "${RIYA},${RIYA},Riya"
expect_value "create: lead number assigned" '.data.lead_number > 0' true
expect_value "create: an owner holds it (D40)" '.data.held_until != null' true
expect_value "create: involved" '.data.involved_membership_ids | join(",")' "${FRONT_DESK}"
expect_value "create: no patient file, not awaiting" '[.data.patient_id, .data.is_awaiting_reply] | map(tostring) | join(",")' null,false
NO_IDEMPOTENCY_KEY=1 expect 422 "create without X-Idempotency-Key" POST /app/leads "{\"contact_id\":\"${MEERA}\"}"
expect 409 "a second open lead for Riya (L6)" POST /app/leads "{\"contact_id\":\"${RIYA}\"}"
expect_value "second open lead: reason" '.error.reason' lead_open_exists
expect_value "second open lead: names it" "(.error.detail | contains(\"#${RIYA_LEAD_NUMBER}\")) and (.error.detail | contains(\"${RIYA_LEAD}\"))" true
ACCEPT_LANGUAGE=es expect 409 "second open lead in Spanish" POST /app/leads "{\"contact_id\":\"${RIYA}\"}"
expect_value "second open lead: Spanish detail" '.error.detail | contains("ya tiene")' true
expect 400 "create with neither contact_id nor contact" POST /app/leads '{"source":"google"}'
expect_value "neither: field" "${FIELDS}" body.contact_id
expect 400 "create with both contact_id and contact" POST /app/leads \
  "$(jq -nc --arg id "${MEERA}" --arg last "${T}" --arg phone "+91${N}09" '{contact_id: $id, contact: {first_name: "Both", last_name: $last, phones: [{phone: $phone, is_primary: true}]}}')"
expect 400 "create with the owner also involved" POST /app/leads \
  "{\"contact_id\":\"${MEERA}\",\"owner_membership_id\":\"${DOCTOR}\",\"involved_membership_ids\":[\"${DOCTOR}\"]}"
expect_value "owner involved: field" "${FIELDS}" body.involved_membership_ids
expect 400 "create for an unknown contact" POST /app/leads "{\"contact_id\":\"${NOWHERE_CONTACT}\"}"
expect_value "unknown contact: field" "${FIELDS}" contact_id
expect 400 "create with an unknown owner" POST /app/leads "{\"contact_id\":\"${MEERA}\",\"owner_membership_id\":\"${NOWHERE_MEMBERSHIP}\"}"
expect_value "unknown owner: field" "${FIELDS}" owner_membership_id
expect 400 "create with an unknown status" POST /app/leads "{\"contact_id\":\"${MEERA}\",\"status\":\"hot\"}"
expect 400 "create with an interest twice" POST /app/leads "{\"contact_id\":\"${MEERA}\",\"interests\":[\"peel\",\"peel\"]}"
expect 400 "create with notes over 2000" POST /app/leads \
  "$(jq -nc --arg id "${MEERA}" '{contact_id: $id, notes: ("a" * 2001)}')"
expect 400 "create with kind (server-set, L5)" POST /app/leads "{\"contact_id\":\"${MEERA}\",\"kind\":\"retarget\"}"
expect 409 "create as clinic_visited (check-in's, L8)" POST /app/leads "{\"contact_id\":\"${MEERA}\",\"status\":\"clinic_visited\"}"
expect_value "clinic_visited on create: reason" '.error.reason' lead_closed
expect 200 "create Meera's lead (contacted, google)" POST /app/leads \
  "{\"contact_id\":\"${MEERA}\",\"status\":\"contacted\",\"source\":\"google\",\"interests\":[\"peel\"],\"branch_id\":\"${ADAJAN}\",\"follow_up_at\":\"2030-01-02T10:00:00Z\"}"
MEERA_LEAD="$(last '.data.id')"
expect_value "no owner, no hold" '[.data.owner_membership_id, .data.held_until] | map(tostring) | join(",")' null,null
expect 200 "create Kabir's lead with a new contact (L1)" POST /app/leads \
  "$(jq -nc --arg last "${T}" --arg phone "+91${N}04" '{contact: {first_name: "Kabir", last_name: $last, phones: [{phone: $phone, is_primary: true}]}, interests: ["prp"]}')"
KABIR_LEAD="$(last '.data.id')"
KABIR="$(last '.data.contact_id')"
expect_value "inline contact: the summary" '[.data.contact.first_name, .data.contact.primary_phone] | join(",")' "Kabir,+91${N}04"
expect_value "inline contact: no source, not held" '[.data.source, .data.held_until] | map(tostring) | join(",")' null,null
expect 409 "inline contact on another household's number (CT3)" POST /app/leads \
  "$(jq -nc --arg last "${T}" --arg phone "+91${N}01" '{contact: {first_name: "Copy", last_name: $last, phones: [{phone: $phone, is_primary: true}]}}')"
expect_value "inline clash: reason" '.error.reason' contact_phone_exists
expect 400 "inline contact, then an unknown owner — nothing kept" POST /app/leads \
  "$(jq -nc --arg last "${T}" --arg phone "+91${N}05" --arg owner "${NOWHERE_MEMBERSHIP}" '{contact: {first_name: "Ghost", last_name: $last, phones: [{phone: $phone, is_primary: true}]}, owner_membership_id: $owner}')"
expect 200 "the rolled-back contact is not there" GET "/app/contacts?phone=%2B91${N}05"
expect_value "rolled back: no contact" '.data | length' 0
expect 400 "inline contact without phones" POST /app/leads "$(jq -nc --arg last "${T}" '{contact: {first_name: "Nophone", last_name: $last}}')"

# ---- Read (route 4) and the contact side --------------------------------------------------------
expect 200 "get Riya's lead" GET "/app/leads/${RIYA_LEAD}"
expect_value "get: summary and team" '[.data.contact.contact_number > 0, (.data.owner_membership_id == "'"${DOCTOR}"'")] | all' true
expect 404 "get an unknown lead" GET "/app/leads/${NOWHERE_LEAD}"
expect 200 "Riya's contact has the open lead" GET "/app/contacts/${RIYA}"
expect_value "open_lead_id / open_lead_status" '[.data.open_lead_id, .data.open_lead_status] | join(",")' "${RIYA_LEAD},new"
expect 200 "Riya's preview" GET "/app/contacts/${RIYA}/preview"
expect_value "preview: open_lead" '[.data.open_lead.id, .data.open_lead.status, .data.open_lead.owner_membership_id] | join(",")' "${RIYA_LEAD},new,${DOCTOR}"
expect 200 "Neel has no open lead" GET "/app/contacts/${NEEL}"
expect_value "Neel: open_lead_id null" '.data.open_lead_id' null
expect 200 "contacts with an open lead" GET "/app/contacts?q=${T}&has_open_lead=true&sort=name"
expect_value "has_open_lead=true" '[.data[].first_name] | join(",")' Kabir,Meera,Riya
expect 200 "contacts without an open lead" GET "/app/contacts?q=${T}&has_open_lead=false"
expect_value "has_open_lead=false" '[.data[].first_name] | join(",")' Neel
expect 200 "the lead's team handles Riya (CT11)" GET "/app/contacts/${RIYA}/members"
expect_value "Riya's members: owner and involved" "[.data[].membership_id] | sort | join(\",\")" "$(printf '%s\n' "${DOCTOR}" "${FRONT_DESK}" | sort | paste -sd, -)"
expect 409 "Riya cannot be removed while her lead is live (CT7)" DELETE "/app/contacts/${RIYA}?reason=mistake"
expect_value "contact in use: reason" '.error.reason' contact_in_use

# ---- List (route 1): search, filters, sorts -----------------------------------------------------
expect 200 "list this run's leads (newest first)" GET "/app/leads?q=${T}"
expect_value "newest first" "${NAMES}" Kabir,Meera,Riya
expect_value "a total" '.meta.pagination.estimated_total' 3
expect 200 "q: the lead number #N" GET "/app/leads?q=%23${RIYA_LEAD_NUMBER}"
expect_value "#N: Riya's lead" '[.data[].id] | join(",")' "${RIYA_LEAD}"
expect 200 "q: the contact number C-N" GET "/app/leads?q=C-$(last '.data[0].contact.contact_number')"
expect_value "C-N: Riya's lead" '[.data[].id] | join(",")' "${RIYA_LEAD}"
expect 200 "q: Meera's number, typed with spaces" GET "/app/leads?q=%2B91%20${N:0:5}%20${N:5}02"
expect_value "number: Meera's lead" "${NAMES}" Meera
expect 200 "q: part of a name" GET "/app/leads?q=Kabi"
expect_value "name part: Kabir's lead among them" "[.data[].id] | index(\"${KABIR_LEAD}\") != null" true
expect 400 "q: two letters" GET "/app/leads?q=ab"
expect_value "short q: field" "${FIELDS}" q
expect 200 "status: several" GET "/app/leads?q=${T}&status=new,contacted"
expect_value "status new,contacted" "${NAMES}" Kabir,Meera,Riya
expect 200 "status: contacted" GET "/app/leads?q=${T}&status=contacted"
expect_value "status contacted" "${NAMES}" Meera
expect 400 "status: an unknown one" GET "/app/leads?q=${T}&status=hot"
expect 200 "source: several" GET "/app/leads?q=${T}&source=instagram,google"
expect_value "source instagram,google" "${NAMES}" Meera,Riya
expect 200 "interests: any of" GET "/app/leads?q=${T}&interests=peel,prp"
expect_value "interests peel,prp" "${NAMES}" Kabir,Meera
expect 200 "kind: enquiry" GET "/app/leads?q=${T}&kind=enquiry"
expect_value "kind enquiry" '.data | length' 3
expect 200 "contact_id" GET "/app/leads?contact_id=${MEERA}"
expect_value "contact_id: Meera's" "${NAMES}" Meera
expect 200 "owner (Mine)" GET "/app/leads?q=${T}&owner_membership_id=${DOCTOR}"
expect_value "owner: Riya's" "${NAMES}" Riya
expect 200 "team: the involved member" GET "/app/leads?q=${T}&team_membership_id=${FRONT_DESK}"
expect_value "team (involved): Riya's" "${NAMES}" Riya
expect 200 "team: the owner" GET "/app/leads?q=${T}&team_membership_id=${DOCTOR}"
expect_value "team (owner): Riya's" "${NAMES}" Riya
expect 200 "team: an unknown member" GET "/app/leads?q=${T}&team_membership_id=${NOWHERE_MEMBERSHIP}"
expect_value "team unknown: empty" '.data | length' 0
expect 200 "ownership: held" GET "/app/leads?q=${T}&ownership=held"
expect_value "held: Riya's" "${NAMES}" Riya
expect 200 "ownership: open" GET "/app/leads?q=${T}&ownership=open"
expect_value "open to claim" "${NAMES}" Kabir,Meera
expect 200 "ownership: releasing today (none yet)" GET "/app/leads?q=${T}&ownership=releasing_today"
expect_value "releasing today: none" '.data | length' 0
lead_sql "UPDATE app.leads l SET held_until = greatest(now() + interval '1 minute', ((date_trunc('day', now() AT TIME ZONE o.timezone) + interval '1 day') AT TIME ZONE o.timezone) - interval '1 minute') FROM tenancy.organizations o WHERE o.id = l.organization_id AND l.public_id = '${RIYA_LEAD}';"
expect 200 "ownership: releasing today" GET "/app/leads?q=${T}&ownership=releasing_today"
expect_value "releasing today: Riya's" "${NAMES}" Riya
expect 200 "branch_id" GET "/app/leads?q=${T}&branch_id=${ADAJAN}"
expect_value "branch Adajan" "${NAMES}" Meera
expect 200 "branch_ids (picker: Vesu — and no branch)" GET "/app/leads?q=${T}&branch_ids=${VESU}"
expect_value "picker Vesu" "${NAMES}" Kabir,Riya
expect 200 "follow-up range" GET "/app/leads?q=${T}&follow_up_at_from=2030-01-01T00:00:00Z&follow_up_at_to=2030-01-03T00:00:00Z"
expect_value "follow-up range: Meera's" "${NAMES}" Meera
expect 200 "created range: none before 2020" GET "/app/leads?q=${T}&created_to=2020-01-01T00:00:00Z"
expect_value "created_to 2020: none" '.data | length' 0
expect 200 "sort name" GET "/app/leads?q=${T}&sort=name"
expect_value "name A–Z" "${NAMES}" Kabir,Meera,Riya
expect 200 "sort name desc" GET "/app/leads?q=${T}&sort=name&order=desc"
expect_value "name Z–A" "${NAMES}" Riya,Meera,Kabir
expect 200 "sort status (then newest)" GET "/app/leads?q=${T}&sort=status"
expect_value "status order" "${NAMES}" Meera,Kabir,Riya
expect 200 "sort source — no source last (L7)" GET "/app/leads?q=${T}&sort=source"
expect_value "source asc, empty last" "${NAMES}" Meera,Riya,Kabir
expect 200 "sort source desc — no source still last" GET "/app/leads?q=${T}&sort=source&order=desc"
expect_value "source desc, empty last" "${NAMES}" Riya,Meera,Kabir
expect_equal "sort source pages one by one" "$(page_names "/app/leads?q=${T}&sort=source" 1)" Meera,Riya,Kabir
expect_equal "sort source desc pages one by one" "$(page_names "/app/leads?q=${T}&sort=source&order=desc" 1)" Riya,Meera,Kabir
expect 200 "sort follow_up_at — not set last" GET "/app/leads?q=${T}&sort=follow_up_at"
expect_value "follow-up first, the rest after" '.data[0].contact.first_name' Meera
expect_value "every lead kept (today they dropped out)" '.data | length' 3
expect_equal "sort follow_up_at pages one by one" "$(page_names "/app/leads?q=${T}&sort=follow_up_at" 2 | cut -d, -f1)" Meera
expect 200 "sort last_activity_at (none yet: all kept)" GET "/app/leads?q=${T}&sort=last_activity_at"
expect_value "last_activity_at keeps all" '.data | length' 3
expect 400 "sort by an unknown field" GET "/app/leads?q=${T}&sort=phone"
expect 400 "an unknown filter" GET "/app/leads?q=${T}&is_contact_thread=true"

# ---- The stream moves the lead (5.10) -----------------------------------------------------------
expect 200 "message template with <interest>" POST /app/contact-message-templates "{\"name\":\"Lead hello ${T}\",\"body\":\"Hi <first>, about <interest>.\"}"
HELLO="$(last '.data.id')"
expect 200 "send Riya a WhatsApp" POST "/app/contacts/${RIYA}/activities/send-message" \
  "{\"type\":\"whatsapp\",\"body\":\"Hi <first>, about <interest>.\",\"contact_message_template_id\":\"${HELLO}\"}"
expect_value "<interest> is the open lead's first interest (M9)" '.data.body' "Hi Riya, about LHR."
expect 200 "Riya's lead after the send" GET "/app/leads/${RIYA_LEAD}"
expect_value "a sent line: new → contacted" '.data.status' contacted
expect_value "the lead's last activity is the contact's" '.data.last_activity_at != null' true
expect 200 "Kabir calls in" POST "/app/contacts/${KABIR}/activities/log-call" '{"direction":"received","body":"Price for PRP?"}'
expect 200 "Kabir's lead after the incoming call" GET "/app/leads/${KABIR_LEAD}"
expect_value "a received call: still new, awaiting a reply" '[.data.status, .data.is_awaiting_reply] | map(tostring) | join(",")' new,true
expect 200 "awaiting a reply (Unreplied)" GET "/app/leads?q=${T}&is_awaiting_reply=true"
expect_value "awaiting: Kabir's" "${NAMES}" Kabir
expect 200 "not awaiting a reply" GET "/app/leads?q=${T}&is_awaiting_reply=false"
expect_value "not awaiting" "${NAMES}" Meera,Riya
expect 200 "sort last_activity_at — newest first, none last" GET "/app/leads?q=${T}&sort=last_activity_at"
expect_value "last activity order" "${NAMES}" Kabir,Riya,Meera
expect 200 "an outgoing call to Kabir" POST "/app/contacts/${KABIR}/activities/log-call" '{"direction":"sent","body":"Called back"}'
expect 200 "Kabir's lead after the call" GET "/app/leads/${KABIR_LEAD}"
expect_value "a call the team made: new → contacted (P21)" '.data.status' contacted

# ---- Update (route 5) ---------------------------------------------------------------------------
expect 200 "get Riya's lead for a save" GET "/app/leads/${RIYA_LEAD}"
UPDATED_AT="$(last '.data.updated_at')"
HELD_BEFORE="$(last '.data.held_until')"
expect 200 "assign Riya's lead to the admin" PATCH "/app/leads/${RIYA_LEAD}" "{\"owner_membership_id\":\"${ADMIN}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "new owner" '.data.owner_membership_id' "${ADMIN}"
expect_value "a new hold" ".data.held_until != \"${HELD_BEFORE}\" and .data.held_until != null" true
expect_value "the replaced owner stays involved (L9)" "[.data.involved_membership_ids[]] | sort | join(\",\")" "$(printf '%s\n' "${DOCTOR}" "${FRONT_DESK}" | sort | paste -sd, -)"
expect 409 "a stale save (D43)" PATCH "/app/leads/${RIYA_LEAD}" "{\"notes\":\"x\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "stale save: reason" '.error.reason' record_changed
expect 200 "assign it to the involved front desk" PATCH "/app/leads/${RIYA_LEAD}" "{\"owner_membership_id\":\"${FRONT_DESK}\"}"
expect_value "the owner is not also involved" "[.data.involved_membership_ids[]] | sort | join(\",\")" "$(printf '%s\n' "${DOCTOR}" "${ADMIN}" | sort | paste -sd, -)"
expect 400 "owner and involved name the same member" PATCH "/app/leads/${RIYA_LEAD}" \
  "{\"owner_membership_id\":\"${DOCTOR}\",\"involved_membership_ids\":[\"${DOCTOR}\"]}"
expect 200 "replace the involved set" PATCH "/app/leads/${RIYA_LEAD}" "{\"involved_membership_ids\":[\"${MARKETING}\"]}"
expect_value "involved replaced" '.data.involved_membership_ids | join(",")' "${MARKETING}"
expect 200 "no owner" PATCH "/app/leads/${RIYA_LEAD}" '{"owner_membership_id":null}'
expect_value "no owner, no hold" '[.data.owner_membership_id, .data.held_until] | map(tostring) | join(",")' null,null
expect_value "the last owner stays involved" "[.data.involved_membership_ids[]] | sort | join(\",\")" "$(printf '%s\n' "${MARKETING}" "${FRONT_DESK}" | sort | paste -sd, -)"
expect 200 "status, interests, follow-up, notes" PATCH "/app/leads/${RIYA_LEAD}" \
  '{"status":"follow_up","interests":["clinical"],"follow_up_at":"2030-02-01T09:00:00Z","notes":"Call after 6"}'
expect_value "changed" '[.data.status, (.data.interests | join("|")), .data.notes] | join(",")' "follow_up,clinical,Call after 6"
expect 409 "set clinic_visited (check-in's, L8)" PATCH "/app/leads/${RIYA_LEAD}" '{"status":"clinic_visited"}'
expect_value "clinic_visited: reason" '.error.reason' lead_closed
expect 400 "PATCH nothing" PATCH "/app/leads/${RIYA_LEAD}" '{}'
expect 400 "PATCH contact_id (not changeable)" PATCH "/app/leads/${RIYA_LEAD}" "{\"contact_id\":\"${NEEL}\"}"
expect 400 "PATCH an unknown branch" PATCH "/app/leads/${RIYA_LEAD}" '{"branch_id":"brn_aaaaaaaaaaaaaaaaaaaaa"}'
expect_value "unknown branch: field" "${FIELDS}" branch_id
expect 404 "PATCH an unknown lead" PATCH "/app/leads/${NOWHERE_LEAD}" '{"notes":"x"}'
# Closed, then a new one, then reopening the closed one (L6)
expect 200 "close Meera's lead as lost" PATCH "/app/leads/${MEERA_LEAD}" '{"status":"lost"}'
expect 200 "Meera has no open lead now" GET "/app/contacts/${MEERA}"
expect_value "closed: open_lead_id null" '.data.open_lead_id' null
expect 200 "a closed lead does not block a new one (Re-create lead)" POST /app/leads "{\"contact_id\":\"${MEERA}\",\"source\":\"whatsapp\"}"
MEERA_LEAD_AGAIN="$(last '.data.id')"
expect 409 "reopen the lost lead while the new one is open" PATCH "/app/leads/${MEERA_LEAD}" '{"status":"new"}'
expect_value "reopen: reason" '.error.reason' lead_open_exists
expect 200 "close the new one as invalid" PATCH "/app/leads/${MEERA_LEAD_AGAIN}" '{"status":"invalid"}'
expect 200 "reopen the lost lead" PATCH "/app/leads/${MEERA_LEAD}" '{"status":"no_response"}'
# clinic_visited is set by check-in (sub-domain 6) — here by SQL
lead_sql "UPDATE app.leads SET status = 'clinic_visited' WHERE public_id = '${MEERA_LEAD}';"
expect 409 "change a clinic_visited lead's status (final, L8)" PATCH "/app/leads/${MEERA_LEAD}" '{"status":"new"}'
expect_value "visited is final: reason" '.error.reason' lead_closed
expect 200 "its other fields stay editable" PATCH "/app/leads/${MEERA_LEAD}" '{"notes":"Visited Vesu","status":"clinic_visited"}'
expect_value "notes saved, still visited" '[.data.notes, .data.status] | join(",")' "Visited Vesu,clinic_visited"

# ---- Claim and release (routes 8–9) --------------------------------------------------------------
as_role front_desk
expect 200 "front desk claims Kabir's lead" POST "/app/leads/${KABIR_LEAD}/claim"
expect_value "claimed: the caller owns it" '.data.owner_membership_id' "${FRONT_DESK}"
expect_value "claimed: held" '.data.held_until != null' true
HELD_FIRST="$(last '.data.held_until')"
NO_IDEMPOTENCY_KEY=1 expect 422 "claim without X-Idempotency-Key" POST "/app/leads/${KABIR_LEAD}/claim"
expect 200 "claiming again extends the hold" POST "/app/leads/${KABIR_LEAD}/claim"
expect_value "hold extended" ".data.held_until > \"${HELD_FIRST}\"" true
as_role doctor
expect 409 "the doctor claims a lead the front desk holds" POST "/app/leads/${KABIR_LEAD}/claim"
expect_value "held by another: reason" '.error.reason' lead_held
expect 403 "the doctor releases the front desk's lead" POST "/app/leads/${KABIR_LEAD}/release"
expect_value "not yours: reason" '.error.reason' lead_not_yours
lead_sql "UPDATE app.leads SET held_until = now() - interval '1 minute' WHERE public_id = '${KABIR_LEAD}';"
expect 200 "the hold ran out: the doctor takes it over" POST "/app/leads/${KABIR_LEAD}/claim"
expect_value "taken over" '.data.owner_membership_id' "${DOCTOR}"
expect_value "the front desk stays involved (L9)" '.data.involved_membership_ids | join(",")' "${FRONT_DESK}"
expect 200 "the doctor releases it" POST "/app/leads/${KABIR_LEAD}/release"
expect_value "released: no owner, no hold" '[.data.owner_membership_id, .data.held_until] | map(tostring) | join(",")' null,null
expect_value "released: the doctor stays involved" "[.data.involved_membership_ids[]] | sort | join(\",\")" "$(printf '%s\n' "${DOCTOR}" "${FRONT_DESK}" | sort | paste -sd, -)"
expect 403 "release a lead nobody owns" POST "/app/leads/${KABIR_LEAD}/release"
expect 409 "claim a closed lead" POST "/app/leads/${MEERA_LEAD_AGAIN}/claim"
expect_value "claim closed: reason" '.error.reason' lead_closed
expect 409 "release a closed lead" POST "/app/leads/${MEERA_LEAD_AGAIN}/release"
expect_value "release closed: reason" '.error.reason' lead_closed
expect 404 "claim an unknown lead" POST "/app/leads/${NOWHERE_LEAD}/claim"

# ---- Branch visibility (D9) ---------------------------------------------------------------------
as_role front_desk
expect 200 "front desk (Vesu): sees Vesu and no-branch leads" GET "/app/leads?q=${T}"
expect_value "front desk list" "[.data[].id] | index(\"${MEERA_LEAD}\") == null" true
expect 404 "front desk: an Adajan lead" GET "/app/leads/${MEERA_LEAD}"
expect 400 "front desk: a lead in Adajan" POST /app/leads "{\"contact_id\":\"${NEEL}\",\"branch_id\":\"${ADAJAN}\"}"
expect_value "another branch: field" "${FIELDS}" branch_id
expect 200 "front desk: Neel's lead in Vesu" POST /app/leads "{\"contact_id\":\"${NEEL}\",\"branch_id\":\"${VESU}\"}"
NEEL_LEAD="$(last '.data.id')"

# ---- Delete and restore (routes 6–7) ------------------------------------------------------------
as_role owner
expect 400 "delete without a reason" DELETE "/app/leads/${NEEL_LEAD}"
expect 204 "delete Neel's lead" DELETE "/app/leads/${NEEL_LEAD}?reason=duplicate"
expect 404 "the deleted lead is gone" GET "/app/leads/${NEEL_LEAD}"
expect 200 "Neel may have a new lead now" POST /app/leads "{\"contact_id\":\"${NEEL}\"}"
NEEL_LEAD_AGAIN="$(last '.data.id')"
expect 409 "restore while Neel has another open lead" POST "/app/leads/${NEEL_LEAD}/restore"
expect_value "restore over an open lead: reason" '.error.reason' lead_open_exists
expect 204 "delete the new one" DELETE "/app/leads/${NEEL_LEAD_AGAIN}?reason=mistake"
expect 204 "Neel's contact can go now (no live lead)" DELETE "/app/contacts/${NEEL}?reason=mistake"
expect 409 "restore a lead whose contact was removed" POST "/app/leads/${NEEL_LEAD}/restore"
expect_value "contact removed: reason" '.error.reason' record_restore_conflict
expect 200 "restore Neel's contact" POST "/app/contacts/${NEEL}/restore"
expect 200 "restore the lead" POST "/app/leads/${NEEL_LEAD}/restore"
expect_value "restored" '.data.id' "${NEEL_LEAD}"
expect 409 "restore a live lead" POST "/app/leads/${NEEL_LEAD}/restore"
expect_value "live: reason" '.error.reason' record_not_deleted
expect 404 "restore an unknown lead" POST "/app/leads/${NOWHERE_LEAD}/restore"

# ---- Export (route 2) ---------------------------------------------------------------------------
expect 200 "export this run's leads" GET "/app/leads/exports?q=${T}&sort=name"
expect_value "export file" '[(.data.file_name | startswith("leads-")), .data.content_type == "text/csv"] | all' true
expect_value "export rows" '.data.row_count' 5
expect_value "export carries the lead ids" ".data.content | contains(\"${RIYA_LEAD}\")" true
as_role doctor
expect 200 "doctor exports (lead:export, L4)" GET "/app/leads/exports?q=${T}"

# ---- Gates by role ------------------------------------------------------------------------------
as_role front_desk
expect 403 "front desk: export (no lead:export)" GET "/app/leads/exports?q=${T}"
expect 403 "front desk: delete (no lead:delete)" DELETE "/app/leads/${NEEL_LEAD}?reason=mistake"
expect 200 "front desk: list" GET "/app/leads?q=${T}"
as_role marketing
expect 200 "marketing: list" GET "/app/leads?q=${T}"
expect 200 "marketing: create with a new contact (contact:create)" POST /app/leads \
  "$(jq -nc --arg last "${T}" --arg phone "+91${N}06" '{contact: {first_name: "Isha", last_name: $last, phones: [{phone: $phone, is_primary: true}]}}')"
as_role therapist
expect 403 "therapist: list (no lead:read)" GET "/app/leads?q=${T}"
as_role accountant
expect 403 "accountant: list" GET "/app/leads?q=${T}"
expect 403 "accountant: claim" POST "/app/leads/${KABIR_LEAD}/claim"
expect 403 "accountant: create" POST /app/leads "{\"contact_id\":\"${NEEL}\"}"
as_role owner
expect 404 "the convert route is gone (L8)" POST "/app/leads/${RIYA_LEAD}/convert"
expect 404 "the reads route is gone (L10)" POST "/app/leads/${RIYA_LEAD}/reads"
