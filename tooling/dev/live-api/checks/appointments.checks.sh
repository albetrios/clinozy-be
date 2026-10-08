#!/usr/bin/env bash
# TEMPORARY — sub-domain 6, Appointments (routes-final §6, launch ROUTE #132): booking and walk-ins,
# the slot rules and the exclusion constraints, the list (and the floor), moves, the lifecycle and
# the floor stage, the check-in conversion, copy, delete and restore, the calendar reads, the
# export, what the contact reads, the gates by role. Sourced by run-live-api-checks.sh after
# live-api.sh; names carry the run suffix. The fixture organization's live appointments and Vesu's
# holidays are cleared first, so a re-run on the same fixture starts from free slots.
S="${LIVE_API_RUN:-$(date +%s)}"
# This run's last name — `q=${T}` lists only this run's appointments (through their contacts).
T="w${S}"
N="6${S: -7}"
NOWHERE_APPOINTMENT=appt_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_CONTACT=con_aaaaaaaaaaaaaaaaaaaaa
FIELDS='[.error.errors[].field] | join(",")'
NAMES='[.data[].contact.first_name] | join(",")'
VESU="$(fixture '.branches.vesu')"
ADAJAN="$(fixture '.branches.adajan')"
ADMIN="$(fixture '.members.admin.membership_id')"
DOCTOR="$(fixture '.members.doctor.membership_id')"
THERAPIST="$(fixture '.members.therapist.membership_id')"
ORGANIZATION="$(fixture '.organization_id')"
TIME_ZONE="$(fixture '.timezone')"

# days KIND FROM COUNT — COUNT dates from today+FROM whose weekday is a working one (KIND=work,
# Monday–Saturday — the default) or a Sunday (KIND=sun), one per line.
days() {
  node -e 'const [kind, from, count, timeZone] = process.argv.slice(1);
const found = [];
for (let offset = Number(from); found.length < Number(count) && offset < Number(from) + 60; offset += 1) {
  const at = new Date(Date.now() + offset * 864e5);
  const isSunday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at) === "Sun";
  if ((kind === "sun") === isSunday) found.push(new Intl.DateTimeFormat("en-CA", { timeZone }).format(at));
}
console.log(found.join("\n"));' -- "$1" "$2" "$3" "${TIME_ZONE}"
}
mapfile -t WORKDAYS < <(days work 2 3)
DAY="${WORKDAYS[0]}"
DAY2="${WORKDAYS[1]}"
HOLIDAY="${WORKDAYS[2]}"
SUNDAY="$(days sun 2 1)"
TODAY="$(calendar_day 0)"
YESTERDAY="$(calendar_day -1)"

# person FIRST SUFFIX — a contact of this run with its own number; sets LAST_CONTACT.
person() {
  expect 200 "contact $1" POST /app/contacts "$(jq -nc --arg first "$1" --arg last "${T}" --arg phone "+91${N}$2" \
    '{first_name: $first, last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
  LAST_CONTACT="$(last '.data.id')"
}

# book CONTACT DATE START [EXTRA_JSON] — a booking body at Vesu with the doctor.
book() {
  local extra="${4:-}"
  [ -n "${extra}" ] || extra='{}'
  jq -nc --arg contact "$1" --arg branch "${VESU}" --arg doctor "${DOCTOR}" --arg date "$2" --arg start "$3" --argjson extra "${extra}" \
    '{contact_id: $contact, branch_id: $branch, doctor_membership_id: $doctor, appointment_date: $date, start_time: $start, service_label: "Consultation"} + $extra'
}

# appointment_sql SQL — one statement in the Compose database (a state the API never writes).
appointment_sql() { compose_sql <<<"$1" >/dev/null; }

appointment_sql "UPDATE app.appointments SET deleted_at = now(), delete_reason = 'mistake' WHERE deleted_at IS NULL AND organization_id = (SELECT id FROM tenancy.organizations WHERE public_id = '${ORGANIZATION}');"
appointment_sql "UPDATE app.branch_holidays SET deleted_at = now(), delete_reason = 'mistake' WHERE deleted_at IS NULL AND branch_id = (SELECT id FROM app.branches WHERE public_id = '${VESU}');"

as_role owner
person Asha 01
ASHA="${LAST_CONTACT}"
person Bela 02
BELA="${LAST_CONTACT}"
person Chirag 03
CHIRAG="${LAST_CONTACT}"
expect 200 "Asha's lead" POST /app/leads "{\"contact_id\":\"${ASHA}\",\"interests\":[\"lhr\"]}"
ASHA_LEAD="$(last '.data.id')"
expect 200 "room Vesu" POST "/app/branches/${VESU}/rooms" "{\"name\":\"Room ${T}\"}"
ROOM="$(last '.data.id')"
expect 200 "room Adajan" POST "/app/branches/${ADAJAN}/rooms" "{\"name\":\"Room ${T}\"}"
ADAJAN_ROOM="$(last '.data.id')"
expect 200 "machine Vesu" POST "/app/branches/${VESU}/machines" "{\"name\":\"Laser ${T}\"}"
MACHINE="$(last '.data.id')"
expect 200 "a holiday at Vesu" POST "/app/branches/${VESU}/holidays" "{\"holiday_date\":\"${HOLIDAY}\",\"label\":\"Festival ${T}\"}"
expect 200 "an offering" POST /app/offerings "{\"name\":\"Hydrafacial ${T}\",\"price\":2500}"
OFFERING="$(last '.data.id')"

# ---- Book (route 5) -----------------------------------------------------------------------------
expect 200 "book Asha with an offering (label from it)" POST /app/appointments \
  "$(book "${ASHA}" "${DAY}" 10:00 | jq -c --arg offering "${OFFERING}" 'del(.service_label) + {offering_id: $offering}')"
ASHA_APPOINTMENT="$(last '.data.id')"
ASHA_NUMBER="$(last '.data.appointment_number')"
expect_value "label from the offering (A13)" '.data.service_label' "Hydrafacial ${T}"
expect_value "scheduled, 30 minutes, ends 10:30" '[.data.status, .data.duration_minutes, .data.end_time] | map(tostring) | join(",")' scheduled,30,10:30
expect_value "the contact summary and the open lead (A1)" '[.data.contact.first_name, .data.lead_id, (.data.patient_id | tostring)] | join(",")' "Asha,${ASHA_LEAD},null"
expect_value "off the floor" '[.data.visit_stage, .data.checked_in_at] | map(tostring) | join(",")' null,null
NO_IDEMPOTENCY_KEY=1 expect 422 "book without X-Idempotency-Key" POST /app/appointments "$(book "${BELA}" "${DAY}" 15:00)"
expect 400 "a booking without a date" POST /app/appointments "$(book "${BELA}" "${DAY}" 15:00 | jq -c 'del(.appointment_date)')"
expect_value "no date: field" "${FIELDS}" body.appointment_date
expect 400 "a walk-in with a date" POST /app/appointments "$(book "${BELA}" "${DAY}" 15:00 | jq -c '. + {is_walk_in: true} | del(.start_time)')"
expect_value "walk-in with a date: field" "${FIELDS}" body.appointment_date
expect 400 "33 minutes (A13)" POST /app/appointments "$(book "${BELA}" "${DAY}" 15:00 '{"duration_minutes":33}')"
expect_value "duration: field" "${FIELDS}" body.duration_minutes
expect 400 "no label and no offering" POST /app/appointments "$(book "${BELA}" "${DAY}" 15:00 | jq -c 'del(.service_label)')"
expect_value "no label: field" "${FIELDS}" service_label
expect 400 "a room of another branch (A2)" POST /app/appointments "$(book "${BELA}" "${DAY}" 15:00 "{\"branch_room_id\":\"${ADAJAN_ROOM}\"}")"
expect_value "other branch room: field" "${FIELDS}" branch_room_id
expect 400 "an unknown contact" POST /app/appointments "$(book "${NOWHERE_CONTACT}" "${DAY}" 15:00)"
expect_value "unknown contact: field" "${FIELDS}" contact_id
expect 400 "patient_id is gone (A1)" POST /app/appointments "$(book "${BELA}" "${DAY}" 15:00 '{"patient_id":"pat_aaaaaaaaaaaaaaaaaaaaa"}')"
expect 409 "the doctor is booked then (A3)" POST /app/appointments "$(book "${BELA}" "${DAY}" 10:15)"
expect_value "doctor clash: reason" '.error.reason' slot_taken
expect_value "doctor clash: names the doctor" '.error.detail | test("doctor")' true
expect 200 "Bela right after (half-open ranges)" POST /app/appointments "$(book "${BELA}" "${DAY}" 10:30 "{\"branch_room_id\":\"${ROOM}\"}")"
BELA_APPOINTMENT="$(last '.data.id')"
expect 409 "the room is booked then" POST /app/appointments \
  "$(book "${CHIRAG}" "${DAY}" 10:45 "{\"branch_room_id\":\"${ROOM}\",\"doctor_membership_id\":\"${ADMIN}\"}")"
expect_value "room clash: names the room" '[.error.reason, (.error.detail | test("room"))] | map(tostring) | join(",")' slot_taken,true
expect 200 "Chirag on the machine" POST /app/appointments \
  "$(book "${CHIRAG}" "${DAY}" 12:00 "{\"branch_machine_id\":\"${MACHINE}\",\"doctor_membership_id\":\"${ADMIN}\",\"duration_minutes\":60}")"
CHIRAG_APPOINTMENT="$(last '.data.id')"
expect 409 "the machine is booked then" POST /app/appointments "$(book "${BELA}" "${DAY}" 12:30 "{\"branch_machine_id\":\"${MACHINE}\"}")"
expect_value "machine clash: names the machine" '.error.detail | test("machine")' true
expect 409 "a past start" POST /app/appointments "$(book "${BELA}" "${YESTERDAY}" 11:00)"
expect_value "past: reason" '.error.reason' slot_in_past
expect 409 "a Sunday (the branch's closed day)" POST /app/appointments "$(book "${BELA}" "${SUNDAY}" 11:00)"
expect_value "closed day: reason and why" '[.error.reason, (.error.detail | test("closed_day"))] | map(tostring) | join(",")' slot_closed,true
expect 409 "a holiday" POST /app/appointments "$(book "${BELA}" "${HOLIDAY}" 11:00)"
expect_value "holiday: why" '.error.detail | test("holiday")' true
expect 409 "after the branch closes" POST /app/appointments "$(book "${BELA}" "${DAY}" 19:45)"
expect_value "outside hours: reason" '.error.reason' slot_outside_hours
expect 409 "after the doctor's hours (A4)" POST /app/appointments "$(book "${BELA}" "${DAY}" 19:00)"
expect_value "doctor's hours: why" '[.error.reason, (.error.detail | test("doctor_off"))] | map(tostring) | join(",")' slot_closed,true
expect 200 "Chirag walks in (A6)" POST /app/appointments \
  "$(book "${CHIRAG}" "${DAY}" 10:00 | jq -c 'del(.appointment_date, .start_time) + {is_walk_in: true}')"
WALK_IN="$(last '.data.id')"
expect_value "walk-in: today, checked in, waiting" '[.data.appointment_date, .data.status, .data.visit_stage, .data.is_walk_in] | map(tostring) | join(",")' "${TODAY},checked_in,waiting,true"
expect_value "walk-in: the visit started" '.data.checked_in_at != null' true
expect 200 "a second walk-in with the same doctor (no clash)" POST /app/appointments \
  "$(book "${BELA}" "${DAY}" 10:00 | jq -c 'del(.appointment_date, .start_time) + {is_walk_in: true}')"
BELA_WALK_IN="$(last '.data.id')"
expect 200 "Chirag after the walk-in" GET "/app/contacts/${CHIRAG}"
expect_value "a walk-in opens the patient file (A14)" '.data.patient_id != null' true
expect_value "Chirag has no lead to move" '.data.open_lead_id' null

# ---- List (route 1) and the floor ---------------------------------------------------------------
expect 200 "this run's appointments (day view)" GET "/app/appointments?q=${T}&status=scheduled,confirmed"
expect_value "date, then start" "${NAMES}" Asha,Bela,Chirag
expect 200 "the floor (checked in)" GET "/app/appointments?q=${T}&status=checked_in&sort=visit_stage_changed_at"
expect_value "the floor: the walk-ins" '.data | length' 2
expect 200 "visit_stage filter" GET "/app/appointments?q=${T}&visit_stage=waiting,with_doctor"
expect_value "waiting" '.data | length' 2
expect 200 "is_walk_in" GET "/app/appointments?q=${T}&is_walk_in=false"
expect_value "not walk-ins" '.data | length' 3
expect 200 "q: #number" GET "/app/appointments?q=%23${ASHA_NUMBER}"
expect_value "#number: Asha's" '[.data[].id] | join(",")' "${ASHA_APPOINTMENT}"
expect 200 "q: the service" GET "/app/appointments?q=Hydrafacial%20${T}"
expect_value "service: Asha's" '[.data[].id] | join(",")' "${ASHA_APPOINTMENT}"
expect 200 "q: Bela's number" GET "/app/appointments?q=${N}02&is_walk_in=false"
expect_value "number: Bela's" "${NAMES}" Bela
expect 200 "contact_id" GET "/app/appointments?contact_id=${CHIRAG}"
expect_value "contact: Chirag's two" '.data | length' 2
expect 200 "room filter" GET "/app/appointments?branch_room_id=${ROOM}"
expect_value "room: Bela's" "${NAMES}" Bela
expect 200 "machine filter" GET "/app/appointments?branch_machine_id=${MACHINE}"
expect_value "machine: Chirag's" "${NAMES}" Chirag
expect 200 "offering filter" GET "/app/appointments?offering_id=${OFFERING}"
expect_value "offering: Asha's" "${NAMES}" Asha
expect 200 "doctor filter, one day (inclusive, A8)" GET "/app/appointments?q=${T}&doctor_membership_id=${DOCTOR}&appointment_date_from=${DAY}&appointment_date_to=${DAY}"
expect_value "the doctor's day" "${NAMES}" Asha,Bela
expect 200 "created_at, newest first" GET "/app/appointments?q=${T}&sort=created_at"
expect_value "newest first" '.data[0].id' "${BELA_WALK_IN}"
expect 400 "status: an unknown one" GET "/app/appointments?status=done"
expect 400 "patient_id filter is gone" GET "/app/appointments?patient_id=pat_aaaaaaaaaaaaaaaaaaaaa"
expect 404 "get an unknown appointment" GET "/app/appointments/${NOWHERE_APPOINTMENT}"
expect 200 "get Asha's" GET "/app/appointments/${ASHA_APPOINTMENT}"

# ---- Change and move (route 7) ------------------------------------------------------------------
UPDATED_AT="$(last '.data.updated_at')"
expect 200 "notes only — no slot check" PATCH "/app/appointments/${ASHA_APPOINTMENT}" '{"notes":"First visit"}'
expect 409 "a stale save (D43)" PATCH "/app/appointments/${ASHA_APPOINTMENT}" "{\"notes\":\"x\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "stale: reason" '.error.reason' record_changed
expect 200 "confirm Asha (A5)" POST "/app/appointments/${ASHA_APPOINTMENT}/confirm"
expect_value "confirmed" '.data.status' confirmed
expect 409 "confirm again" POST "/app/appointments/${ASHA_APPOINTMENT}/confirm"
expect_value "confirm twice: reason" '.error.reason' transition_not_allowed
expect 200 "move Asha to 11:00" PATCH "/app/appointments/${ASHA_APPOINTMENT}" '{"start_time":"11:00"}'
expect_value "moved: back to scheduled, counted, stamped" '[.data.status, .data.move_count, (.data.rescheduled_from != null), .data.end_time] | map(tostring) | join(",")' scheduled,1,true,11:30
expect 409 "move into Bela's room" PATCH "/app/appointments/${ASHA_APPOINTMENT}" "{\"start_time\":\"10:30\",\"branch_room_id\":\"${ROOM}\"}"
expect_value "move clash: reason" '.error.reason' slot_taken
expect 400 "move with a 7-minute length" PATCH "/app/appointments/${ASHA_APPOINTMENT}" '{"duration_minutes":7}'
expect 400 "change the contact" PATCH "/app/appointments/${ASHA_APPOINTMENT}" "{\"contact_id\":\"${BELA}\"}"
expect 400 "PATCH nothing" PATCH "/app/appointments/${ASHA_APPOINTMENT}" '{}'
expect 409 "check in a booking of a later day" POST "/app/appointments/${ASHA_APPOINTMENT}/check-in"
expect_value "not due: reason" '.error.reason' appointment_not_due
expect 409 "no-show before the start" POST "/app/appointments/${ASHA_APPOINTMENT}/no-show"
expect_value "no-show early: reason" '.error.reason' appointment_not_due
expect 409 "complete a scheduled booking" POST "/app/appointments/${ASHA_APPOINTMENT}/complete"

# ---- Cancel, reinstate (routes 14, 15) ----------------------------------------------------------
expect 400 "cancel without a reason" POST "/app/appointments/${BELA_APPOINTMENT}/cancel" '{}'
expect 200 "cancel Bela" POST "/app/appointments/${BELA_APPOINTMENT}/cancel" '{"cancel_reason":"patient_asked","cancel_note":"Travelling"}'
expect_value "cancelled with why" '[.data.status, .data.cancel_reason] | join(",")' cancelled,patient_asked
expect 409 "move a cancelled booking" PATCH "/app/appointments/${BELA_APPOINTMENT}" '{"start_time":"16:00"}'
expect_value "not movable: reason" '.error.reason' appointment_not_movable
expect 200 "her slot is free (cancelled frees it)" POST /app/appointments "$(book "${CHIRAG}" "${DAY}" 10:30 "{\"branch_room_id\":\"${ROOM}\"}")"
TAKER="$(last '.data.id')"
expect 409 "reinstate over the taker" POST "/app/appointments/${BELA_APPOINTMENT}/reinstate"
expect_value "reinstate clash: reason" '.error.reason' slot_taken
expect 204 "delete the taker" DELETE "/app/appointments/${TAKER}?reason=mistake"
expect 200 "reinstate Bela" POST "/app/appointments/${BELA_APPOINTMENT}/reinstate"
expect_value "reinstated" '[.data.status, (.data.cancel_reason | tostring)] | join(",")' scheduled,null
expect 409 "reinstate a scheduled booking" POST "/app/appointments/${BELA_APPOINTMENT}/reinstate"

# ---- Check-in, the floor, complete (routes 11, 12, 16, 18–20) -----------------------------------
# A booking due today (the rules never book into the past — SQL moves Asha's to today's midnight)
appointment_sql "UPDATE app.appointments SET appointment_date = '${TODAY}', start_time = '00:00' WHERE public_id = '${ASHA_APPOINTMENT}';"
expect 200 "check Asha in" POST "/app/appointments/${ASHA_APPOINTMENT}/check-in"
expect_value "checked in at waiting" '[.data.status, .data.visit_stage, (.data.checked_in_at != null)] | map(tostring) | join(",")' checked_in,waiting,true
expect_value "the check-in opened her file (A14)" '.data.patient_id != null' true
ASHA_PATIENT="$(last '.data.patient_id')"
expect_value "her lead is no longer open" '.data.lead_id' null
expect 200 "Asha's lead after the check-in" GET "/app/leads/${ASHA_LEAD}"
expect_value "lead: clinic_visited, the file linked (L8)" '[.data.status, .data.patient_id] | join(",")' "clinic_visited,${ASHA_PATIENT}"
expect 200 "Asha's stream" GET "/app/contacts/${ASHA}/activities?type=system"
expect_value "a system line for the move" '.data[-1].body' "Moved to Clinic visited at check-in"
expect 200 "Asha's contact" GET "/app/contacts/${ASHA}"
expect_value "contact: patient file, last visit today" '[.data.patient_id, .data.last_visit_on] | join(",")' "${ASHA_PATIENT},${TODAY}"
expect 200 "the doctor handles Asha now (CT11)" GET "/app/contacts/${ASHA}/members"
expect_value "the doctor among Asha's members" "[.data[].membership_id] | index(\"${DOCTOR}\") != null" true
expect 409 "stage back to waiting" POST "/app/appointments/${ASHA_APPOINTMENT}/stage" '{"visit_stage":"waiting"}'
expect_value "same stage: reason" '.error.reason' transition_not_allowed
expect 400 "stage done (not a stage)" POST "/app/appointments/${ASHA_APPOINTMENT}/stage" '{"visit_stage":"done"}'
expect 200 "with the doctor" POST "/app/appointments/${ASHA_APPOINTMENT}/stage" '{"visit_stage":"with_doctor"}'
expect_value "stage moved" '[.data.visit_stage, (.data.visit_stage_changed_at != null)] | map(tostring) | join(",")' with_doctor,true
expect 409 "stage back (forward only, A11)" POST "/app/appointments/${ASHA_APPOINTMENT}/stage" '{"visit_stage":"waiting"}'
expect 200 "skip to checkout" POST "/app/appointments/${ASHA_APPOINTMENT}/stage" '{"visit_stage":"checkout"}'
expect 409 "resume a running visit" POST "/app/appointments/${ASHA_APPOINTMENT}/resume"
expect 200 "pause" POST "/app/appointments/${ASHA_APPOINTMENT}/pause"
expect_value "paused" '.data.visit_paused_at != null' true
expect 409 "pause twice" POST "/app/appointments/${ASHA_APPOINTMENT}/pause"
expect 200 "resume" POST "/app/appointments/${ASHA_APPOINTMENT}/resume"
expect_value "resumed" '.data.visit_paused_at' null
expect 409 "undo the check-in after the visit moved on" POST "/app/appointments/${ASHA_APPOINTMENT}/undo-check-in"
expect_value "visit started: reason" '.error.reason' visit_started
expect 409 "move a checked-in booking" PATCH "/app/appointments/${ASHA_APPOINTMENT}" "{\"appointment_date\":\"${DAY2}\"}"
expect 200 "complete the visit" POST "/app/appointments/${ASHA_APPOINTMENT}/complete"
expect_value "completed, off the floor" '[.data.status, (.data.completed_at != null), (.data.visit_stage | tostring)] | map(tostring) | join(",")' completed,true,null
expect 409 "complete twice" POST "/app/appointments/${ASHA_APPOINTMENT}/complete"
expect 409 "stage on a completed booking" POST "/app/appointments/${ASHA_APPOINTMENT}/stage" '{"visit_stage":"pharmacy"}'
expect 200 "undo the walk-in's check-in (still waiting)" POST "/app/appointments/${BELA_WALK_IN}/undo-check-in"
expect_value "undone: confirmed, off the floor" '[.data.status, (.data.checked_in_at | tostring), (.data.visit_stage | tostring)] | join(",")' confirmed,null,null
expect 200 "Bela keeps the file the walk-in opened" GET "/app/contacts/${BELA}"
expect_value "Bela's file stays" '.data.patient_id != null' true
appointment_sql "UPDATE app.appointments SET appointment_date = '${TODAY}', start_time = '00:30' WHERE public_id = '${CHIRAG_APPOINTMENT}';"
expect 200 "no-show after the start" POST "/app/appointments/${CHIRAG_APPOINTMENT}/no-show"
expect_value "no_show" '.data.status' no_show

# ---- Copy (route 17) ----------------------------------------------------------------------------
expect 200 "copy Asha's visit to another day (A7)" POST "/app/appointments/${ASHA_APPOINTMENT}/copy" "{\"appointment_date\":\"${DAY2}\",\"start_time\":\"10:00\"}"
COPY="$(last '.data.id')"
expect_value "the copy: scheduled, same contact and service, linked" '[.data.status, .data.contact_id, .data.service_label, .data.copied_from_appointment_id] | join(",")' "scheduled,${ASHA},Hydrafacial ${T},${ASHA_APPOINTMENT}"
expect 409 "copy into the same slot (the create's checks)" POST "/app/appointments/${ASHA_APPOINTMENT}/copy" "{\"appointment_date\":\"${DAY2}\",\"start_time\":\"10:15\"}"
expect_value "copy clash: reason" '.error.reason' slot_taken
expect 409 "copy into the past" POST "/app/appointments/${ASHA_APPOINTMENT}/copy" "{\"appointment_date\":\"${YESTERDAY}\",\"start_time\":\"10:00\"}"
expect 400 "copy without a start" POST "/app/appointments/${ASHA_APPOINTMENT}/copy" "{\"appointment_date\":\"${DAY2}\"}"
expect 404 "copy an unknown booking" POST "/app/appointments/${NOWHERE_APPOINTMENT}/copy" "{\"appointment_date\":\"${DAY2}\",\"start_time\":\"10:00\"}"
expect 200 "Asha's next visit is the copy" GET "/app/contacts/${ASHA}/preview"
expect_value "preview: next and last appointment, the file" '[.data.next_appointment.id, .data.last_appointment.id, .data.patient.id] | join(",")' "${COPY},${ASHA_APPOINTMENT},${ASHA_PATIENT}"

# ---- Delete and restore (routes 8, 9) -----------------------------------------------------------
expect 400 "delete without a reason" DELETE "/app/appointments/${COPY}"
expect 204 "delete the copy" DELETE "/app/appointments/${COPY}?reason=duplicate"
expect 404 "the deleted booking is gone" GET "/app/appointments/${COPY}"
expect 200 "its slot is free" POST /app/appointments "$(book "${BELA}" "${DAY2}" 10:00)"
OTHER="$(last '.data.id')"
expect 409 "restore over the new booking" POST "/app/appointments/${COPY}/restore"
expect_value "restore clash: reason" '.error.reason' slot_taken
expect 204 "delete the new one" DELETE "/app/appointments/${OTHER}?reason=mistake"
expect 200 "restore the copy" POST "/app/appointments/${COPY}/restore"
expect 409 "restore a live booking" POST "/app/appointments/${COPY}/restore"
expect_value "live: reason" '.error.reason' record_not_deleted
expect 409 "Bela cannot be removed while booked (CT7)" DELETE "/app/contacts/${BELA}?reason=mistake"
expect_value "in use: reason" '.error.reason' contact_in_use

# ---- Slots and daily counts (routes 3, 4) -------------------------------------------------------
expect 200 "slots for the doctor" GET "/app/appointments/slots?branch_id=${VESU}&appointment_date=${DAY2}&duration_minutes=30&doctor_membership_id=${DOCTOR}"
expect_value "open; the copy's 10:00 is busy; within the doctor's hours" '[.data.is_open, ([.data.slots[].start_time] | index("10:00") == null), ([.data.slots[].start_time] | index("10:30") != null), (.data.slots[-1].end_time <= "19:00")] | map(tostring) | join(",")' true,true,true,true
expect 200 "slots on a Sunday" GET "/app/appointments/slots?branch_id=${VESU}&appointment_date=${SUNDAY}&duration_minutes=30"
expect_value "closed_day" '[.data.is_open, .data.closed_reason] | map(tostring) | join(",")' false,closed_day
expect 200 "slots on the holiday" GET "/app/appointments/slots?branch_id=${VESU}&appointment_date=${HOLIDAY}&duration_minutes=30"
expect_value "holiday with its label" '[.data.closed_reason, .data.closed_label] | join(",")' "holiday,Festival ${T}"
expect 200 "slots in the past" GET "/app/appointments/slots?branch_id=${VESU}&appointment_date=${YESTERDAY}&duration_minutes=30"
expect_value "past" '.data.closed_reason' past
expect 400 "slots without a length" GET "/app/appointments/slots?branch_id=${VESU}&appointment_date=${DAY2}"
expect 200 "daily counts" GET "/app/appointments/daily-counts?date_from=${DAY}&date_to=${DAY2}&branch_ids=${VESU}"
expect_value "counts: the days, every status" "[((.data | length) >= 2), (.data[0].by_status | keys | length == 6)] | map(tostring) | join(\",\")" true,true
expect 400 "counts: to before from" GET "/app/appointments/daily-counts?date_from=${DAY2}&date_to=${DAY}"
expect_value "counts range: field" "${FIELDS}" date_to

# ---- Export and gates ---------------------------------------------------------------------------
expect 200 "export this run's appointments" GET "/app/appointments/exports?q=${T}"
expect_value "export file" '(.data.file_name | startswith("appointments-")) and (.data.row_count >= 5)' true
as_role doctor
expect 200 "doctor exports (appointment:export, A9)" GET "/app/appointments/exports?q=${T}"
as_role front_desk
expect 403 "front desk: export" GET "/app/appointments/exports?q=${T}"
expect 403 "front desk: delete" DELETE "/app/appointments/${COPY}?reason=mistake"
expect 400 "front desk: book at Adajan (not their branch)" POST /app/appointments "$(book "${BELA}" "${DAY2}" 16:00 "{\"branch_id\":\"${ADAJAN}\"}")"
expect_value "another branch: field" "${FIELDS}" branch_id
expect 200 "front desk: list" GET "/app/appointments?q=${T}"
as_role therapist
expect 200 "therapist: the floor" GET "/app/appointments?status=checked_in"
as_role accountant
expect 403 "accountant: list (no appointment:read)" GET "/app/appointments?q=${T}"
as_role marketing
expect 403 "marketing: book" POST /app/appointments "$(book "${BELA}" "${DAY2}" 16:00)"
expect 200 "marketing: Asha's preview without appointment:read" GET "/app/contacts/${ASHA}/preview"
expect_value "no appointments shown" '[.data.next_appointment, .data.last_appointment] | map(tostring) | join(",")' null,null
as_role owner
expect 404 "the status route is gone (A5)" POST "/app/appointments/${ASHA_APPOINTMENT}/status" '{"status":"confirmed"}'
expect 404 "the visits routes are gone (A10)" GET /app/visits
