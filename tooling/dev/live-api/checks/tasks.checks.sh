#!/usr/bin/env bash
# TEMPORARY — sub-domain 10, Tasks 10.A–10.B (routes-final §10, launch ROUTE #138): the rules'
# switches; tasks added by hand and their life — the tabs, snooze, reassign with the lead moving,
# resolve with what's next, delete and restore, the export; and the rules worker (TK4) — the tasks
# it opens once per record, closes when their record changes, hides while a rule is off, wakes from
# a snooze, the call-back a feedback action ends, and the step "Let Clinozy handle" takes. Sourced by
# run-live-api-checks.sh after live-api.sh; every name carries the run suffix, so the file replays
# on one fixture.
S="${LIVE_API_RUN:-$(date +%s)}"
T="k${S}"
# Ten-digit numbers unique to the run: 7 + the run's last 7 digits + 81–82 (leads takes 01–09, patients 51–55).
N="7${S: -7}"
FIELDS='[.error.errors[].field] | join(",")'
REASON='.error.reason'
VESU="$(fixture '.branches.vesu')"
DOCTOR="$(fixture '.members.doctor.membership_id')"
FRONT_DESK="$(fixture '.members.front_desk.membership_id')"
COUNSELLOR="$(fixture '.members.counsellor.membership_id')"
MARKETING="$(fixture '.members.marketing.membership_id')"
ORGANIZATION="$(fixture '.organization_id')"
RULES='reply,failed_message,follow_up,claim,confirm,arrive,rebook,feedback,aftercare,call_back,next_visit,gone_quiet,payment_due,settle_by,medical_rep_visit'

# instant OFFSET — now plus OFFSET (a `date -d` phrase such as "+1 hour"), as an ISO instant.
instant() { date -u -d "$1" +%Y-%m-%dT%H:%M:%SZ; }

# task_sql SQL — one statement in the Compose database (a state the API never writes).
task_sql() { compose_sql <<<"$1"; }

# rules BODY_JQ — a PUT /app/task-rule-settings body: every rule on, by hand, then BODY_JQ's changes.
rules() {
  jq -nc --arg rules "${RULES}" "{rules: (\$rules | split(\",\") | map({rule_key: ., is_on: true, is_automatic: false}))} | $1"
}

# run_task_rules — one run of the task rules for the fixture organization, now (as the five-minute
# sweep would); waits until the worker logged it.
run_task_rules() {
  local log="${AGENT_STACK_DIR:-/tmp/agent-stack}/worker.log" pattern before
  pattern="\"organizationPublicId\":\"${ORGANIZATION}\".*task-rules.completed"
  before="$(grep -c "${pattern}" "${log}" 2>/dev/null || true)"
  npx tsx tooling/dev/live-api/trigger-sweep.ts task-rules >/dev/null 2>&1
  for _ in $(seq 1 60); do
    sleep 0.5
    if [ "$(grep -c "${pattern}" "${log}" 2>/dev/null || true)" -gt "${before}" ]; then return 0; fi
  done
  record FAIL "a task rules run" "no task-rules.completed for ${ORGANIZATION} within 30 s"
}

# rule_tasks RULE FILTER [TAB] — the rule's tasks for a record (FILTER: `lead_id=…`), everyone's.
rule_tasks() {
  expect 200 "the $1 tasks (${3:-open})" GET "/app/tasks?scope=everyone&tab=${3:-open}&rule_key=$1&$2"
}

# person FIRST SUFFIX — a contact of this run with its own number; sets LAST_CONTACT.
person() {
  expect 200 "contact $1" POST /app/contacts "$(jq -nc --arg first "$1" --arg last "${T}" --arg phone "+91${N}$2" \
    '{first_name: $first, last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
  LAST_CONTACT="$(last '.data.id')"
}

# ==== 10.B Task rule settings (routes 11–12) ======================================================
as_role owner
expect 200 "every rule on, by hand (TK10)" PUT /app/task-rule-settings "$(rules '.')"
expect_value "the 15 rules, in the popover's order" '[.data[].rule_key] | join(",")' "${RULES}"
expect_value "saved: ids, on, by hand" '[.data[] | ((.id | startswith("trs_")) and .is_on and (.is_automatic | not))] | all' true
expect_value "Clinozy can handle four" '[.data[] | select(.can_be_automatic) | .rule_key] | join(",")' confirm,feedback,gone_quiet,payment_due
expect 400 "Clinozy can't handle reply" PUT /app/task-rule-settings '{"rules":[{"rule_key":"reply","is_on":true,"is_automatic":true}]}'
expect_value "reply: field" "${FIELDS}" rules/0/is_automatic
expect 400 "a rule that went (onboarding)" PUT /app/task-rule-settings '{"rules":[{"rule_key":"onboarding","is_on":true,"is_automatic":false}]}'
expect 400 "no rules" PUT /app/task-rule-settings '{"rules":[]}'
expect 200 "read them back" GET /app/task-rule-settings
expect_value "still 15, all on" '[.data[] | select(.is_on)] | length' 15
as_role front_desk
expect 200 "the front desk sees the rules" GET /app/task-rule-settings
expect 403 "the front desk can't change them (organization:update)" PUT /app/task-rule-settings "$(rules '.')"
as_role marketing
expect 403 "marketing has no tasks (task:read)" GET /app/task-rule-settings

# ==== 10.A Tasks (routes 1–10) =====================================================================
as_role owner
person Asha 81
ASHA="${LAST_CONTACT}"
person Bela 82
BELA="${LAST_CONTACT}"
expect 200 "Asha's lead" POST /app/leads "$(jq -nc --arg contact "${ASHA}" --arg branch "${VESU}" '{contact_id: $contact, branch_id: $branch}')"
ASHA_LEAD="$(last '.data.id')"

as_role front_desk
expect 200 "add a task to the front desk queue" POST /app/tasks \
  "$(jq -nc --arg title "Call the lab ${T}" --arg due "$(instant '+1 hour')" --arg contact "${ASHA}" --arg lead "${ASHA_LEAD}" \
    '{title: $title, due_at: $due, owner_role: "front_desk", contact_id: $contact, lead_id: $lead, priority: "high"}')"
CALL_LAB="$(last '.data.id')"
expect_value "manual, queued, the lead's branch and person (TK5, TK6)" '[(.data.id | startswith("task_")), .data.kind, .data.rule_key, .data.owner_role, .data.owner_membership_id, .data.status, .data.priority, .data.branch_id, .data.contact.id, .data.lead_id, .data.can_clinozy_handle, (.data.owner_changes | length)] | map(tostring) | join(",")' "true,manual,null,front_desk,null,open,high,${VESU},${ASHA},${ASHA_LEAD},false,0"
expect 200 "add one for the counsellor" POST /app/tasks \
  "$(jq -nc --arg title "Send the price list ${T}" --arg due "$(instant '+2 hours')" --arg owner "${COUNSELLOR}" --arg contact "${BELA}" \
    '{title: $title, due_at: $due, owner_membership_id: $owner, contact_id: $contact}')"
PRICE_LIST="$(last '.data.id')"
expect_value "the counsellor owns it" '[.data.owner_membership_id, .data.owner_role, .data.branch_id] | map(tostring) | join(",")' "${COUNSELLOR},null,null"
expect 400 "an owner and a queue" POST /app/tasks \
  "$(jq -nc --arg due "$(instant '+1 hour')" --arg owner "${FRONT_DESK}" '{title: "Both", due_at: $due, owner_membership_id: $owner, owner_role: "front_desk"}')"
expect_value "both: field" "${FIELDS}" owner_role
expect 400 "neither an owner nor a queue" POST /app/tasks "$(jq -nc --arg due "$(instant '+1 hour')" '{title: "Nobody", due_at: $due}')"
expect_value "neither: field" "${FIELDS}" owner_membership_id
expect 400 "an owner who can't work tasks (TK6)" POST /app/tasks \
  "$(jq -nc --arg due "$(instant '+1 hour')" --arg owner "${MARKETING}" '{title: "Marketing", due_at: $due, owner_membership_id: $owner}')"
expect_value "can't work: field" "${FIELDS}" owner_membership_id
expect 400 "another person's lead (TK5)" POST /app/tasks \
  "$(jq -nc --arg due "$(instant '+1 hour')" --arg contact "${BELA}" --arg lead "${ASHA_LEAD}" '{title: "Wrong lead", due_at: $due, owner_role: "front_desk", contact_id: $contact, lead_id: $lead}')"
expect_value "another's: field" "${FIELDS}" lead_id
expect 400 "an empty title" POST /app/tasks "$(jq -nc --arg due "$(instant '+1 hour')" '{title: " ", due_at: $due, owner_role: "front_desk"}')"
expect_value "title: field" "${FIELDS}" body.title
NO_IDEMPOTENCY_KEY=1 expect 422 "add without X-Idempotency-Key" POST /app/tasks \
  "$(jq -nc --arg due "$(instant '+1 hour')" '{title: "No key", due_at: $due, owner_role: "front_desk"}')"
as_role marketing
expect 403 "marketing can't add tasks" POST /app/tasks "$(jq -nc --arg due "$(instant '+1 hour')" '{title: "No", due_at: $due, owner_role: "front_desk"}')"

# The tabs (TK3): mine and my roles' queues, or everyone's.
as_role front_desk
expect 200 "To do — mine and my queue" GET "/app/tasks?q=${T}"
expect_value "the front desk sees the queue's task only" '[.data[].id] | join(",")' "${CALL_LAB}"
as_role counsellor
expect 200 "the counsellor's To do" GET "/app/tasks?q=${T}"
expect_value "the counsellor sees their own" '[.data[].id] | join(",")' "${PRICE_LIST}"
expect 200 "everyone's, by due" GET "/app/tasks?q=${T}&scope=everyone"
expect_value "both, earliest due first" '[.data[].id] | join(",")' "${CALL_LAB},${PRICE_LIST}"
expect 200 "by the person" GET "/app/tasks?scope=everyone&contact_id=${BELA}"
expect_value "Bela's: the price list" '[.data[].id] | join(",")' "${PRICE_LIST}"
expect 400 "an unknown tab" GET "/app/tasks?tab=later"

as_role front_desk
expect 200 "get the task (the drawer)" GET "/app/tasks/${CALL_LAB}"
expect_value "the person's summary" '[.data.contact.name, (.data.contact.preference_tags | type), .data.next_task_id] | map(tostring) | join(",")' "Asha ${T},array,null"
expect 200 "change its title and priority" PATCH "/app/tasks/${CALL_LAB}" "$(jq -nc --arg title "Call the lab again ${T}" '{title: $title, priority: "normal"}')"
expect_value "changed" '[.data.title, .data.priority] | join(",")' "Call the lab again ${T},normal"
expect 400 "a change with nothing in it" PATCH "/app/tasks/${CALL_LAB}" '{}'
expect 409 "a change over a newer one (record_changed)" PATCH "/app/tasks/${CALL_LAB}" '{"title":"Stale","expected_updated_at":"2020-01-01T00:00:00Z"}'
expect_value "stale: why" "${REASON}" record_changed
expect 404 "a task not here" GET /app/tasks/task_000000000000000000000

# Snooze (TK7).
expect 400 "snooze into the past" POST "/app/tasks/${CALL_LAB}/snooze" "$(jq -nc --arg until "$(instant '-1 hour')" '{snoozed_until: $until}')"
expect_value "past: field" "${FIELDS}" snoozed_until
expect 200 "snooze it till tomorrow" POST "/app/tasks/${CALL_LAB}/snooze" "$(jq -nc --arg until "$(instant '+1 day')" '{snoozed_until: $until, snooze_label: "Tomorrow"}')"
expect_value "snoozed" '[.data.status, .data.snooze_label] | join(",")' snoozed,Tomorrow
expect 200 "the Snoozed tab" GET "/app/tasks?q=${T}&scope=everyone&tab=snoozed"
expect_value "it is there" '[.data[].id] | join(",")' "${CALL_LAB}"

# Reassign (TK8): an owner-change row; a lead's task moves the lead too.
expect 200 "give it to the counsellor" POST "/app/tasks/${CALL_LAB}/reassign" "$(jq -nc --arg owner "${COUNSELLOR}" '{owner_membership_id: $owner}')"
expect_value "the counsellor's, from the queue, by the front desk" '[.data.owner_membership_id, .data.owner_role, .data.owner_changes[0].from_role, .data.owner_changes[0].to_membership_id, .data.owner_changes[0].changed_by_membership_id] | map(tostring) | join(",")' "${COUNSELLOR},null,front_desk,${COUNSELLOR},${FRONT_DESK}"
expect 200 "the lead moved with it" GET "/app/leads/${ASHA_LEAD}"
expect_value "the counsellor holds the lead" '[.data.owner_membership_id, (.data.held_until != null)] | map(tostring) | join(",")' "${COUNSELLOR},true"
expect 400 "a member and a queue" POST "/app/tasks/${CALL_LAB}/reassign" "$(jq -nc --arg owner "${FRONT_DESK}" '{owner_membership_id: $owner, owner_role: "front_desk"}')"
expect 400 "to marketing" POST "/app/tasks/${CALL_LAB}/reassign" "$(jq -nc --arg owner "${MARKETING}" '{owner_membership_id: $owner}')"
expect_value "marketing: field" "${FIELDS}" owner_membership_id
expect 200 "back to the front desk queue" POST "/app/tasks/${CALL_LAB}/reassign" '{"owner_role":"front_desk"}'
expect_value "queued, two changes, newest first" '[.data.owner_membership_id, .data.owner_role, (.data.owner_changes | length), .data.owner_changes[0].from_membership_id] | map(tostring) | join(",")' "null,front_desk,2,${COUNSELLOR}"
expect 200 "the lead is back in the pool" GET "/app/leads/${ASHA_LEAD}"
expect_value "no owner, no hold" '[.data.owner_membership_id, .data.held_until] | map(tostring) | join(",")' null,null

# Resolve (TK7) — an outcome, and what's next.
expect 400 "an unknown outcome" POST "/app/tasks/${CALL_LAB}/resolve" '{"outcome":"maybe"}'
expect 400 "doing well needs a patient file" POST "/app/tasks/${CALL_LAB}/resolve" '{"outcome":"doing_well"}'
expect_value "no file: field" "${FIELDS}" outcome
expect 200 "no answer — try again in 3 hours" POST "/app/tasks/${CALL_LAB}/resolve" '{"outcome":"no_answer","note":"Engaged"}'
expect_value "snoozed, No answer" '[.data.status, .data.snooze_label, .data.outcome] | map(tostring) | join(",")' "snoozed,No answer,null"
expect_equal "for 3 hours" "$(task_sql "SELECT round(extract(epoch FROM snoozed_until - now()) / 3600) FROM app.tasks WHERE public_id = '${CALL_LAB}';")" 3
expect 200 "done, with what's next" POST "/app/tasks/${CALL_LAB}/resolve" \
  "$(jq -nc --arg title "Collect the report ${T}" --arg due "$(instant '+1 day')" \
    '{outcome: "done", result_text: "Lab called", next: {title: $title, due_at: $due, owner_role: "front_desk", note: "Ask for the PDF"}}')"
expect_value "done by the front desk" '[.data.status, .data.outcome, .data.result_text, .data.resolved_by_membership_id, .data.is_resolved_automatically, (.data.next_task_id | startswith("task_"))] | map(tostring) | join(",")' "done,done,Lab called,${FRONT_DESK},false,true"
NEXT_TASK="$(last '.data.next_task_id')"
expect 409 "resolve it again" POST "/app/tasks/${CALL_LAB}/resolve" '{"outcome":"done"}'
expect_value "again: why" "${REASON}" transition_not_allowed
expect 409 "snooze a done task" POST "/app/tasks/${CALL_LAB}/snooze" "$(jq -nc --arg until "$(instant '+1 day')" '{snoozed_until: $until}')"
expect 200 "the follow-up" GET "/app/tasks/${NEXT_TASK}"
expect_value "a follow-up for the same person and lead" '[.data.kind, .data.why, .data.contact.id, .data.lead_id, .data.owner_role, .data.status] | map(tostring) | join(",")' "follow_up,Ask for the PDF,${ASHA},${ASHA_LEAD},front_desk,open"
expect 200 "the Done tab — resolved today" GET "/app/tasks?q=${T}&scope=everyone&tab=done"
expect_value "the lab call is done" '[.data[].id] | join(",")' "${CALL_LAB}"

# Delete and restore (TK9) — tasks made by hand only.
expect 403 "the front desk can't delete (task:delete)" DELETE "/app/tasks/${NEXT_TASK}?reason=not_needed"
as_role owner
expect 400 "delete without a reason" DELETE "/app/tasks/${NEXT_TASK}"
expect 204 "delete the follow-up" DELETE "/app/tasks/${NEXT_TASK}?reason=not_needed"
expect 404 "it is gone" GET "/app/tasks/${NEXT_TASK}"
expect 409 "restore a live one" POST "/app/tasks/${PRICE_LIST}/restore"
expect_value "live: why" "${REASON}" record_not_deleted
expect 200 "restore it" POST "/app/tasks/${NEXT_TASK}/restore"
expect_value "back, open" '.data.status' open

# The export (task:export).
expect 200 "the CSV" GET "/app/tasks/exports?q=${T}&scope=everyone"
as_role front_desk
expect 403 "the front desk can't export" GET "/app/tasks/exports?q=${T}"

# ==== TK4 The rules worker =========================================================================
as_role owner
# Bela's lead with a follow-up date that has come, the counsellor's.
expect 200 "Bela's lead, follow-up yesterday" POST /app/leads \
  "$(jq -nc --arg contact "${BELA}" --arg branch "${VESU}" --arg owner "${COUNSELLOR}" --arg at "$(instant '-1 day')" \
    '{contact_id: $contact, branch_id: $branch, owner_membership_id: $owner, follow_up_at: $at}')"
BELA_LEAD="$(last '.data.id')"
# Asha's booking tomorrow (moved there in the database — any weekday), still to confirm: the first
# day from a month out the doctor works (the appointments checks change their days and the branch's
# hours), at a slot of its own per run and day (10:00–16:30), so a replay never meets their earlier
# bookings.
ASHA_VISIT=""
for offset in $(seq 30 44); do
  SLOT="$(printf '%02d:%02d' $(( 10 + (S + offset) % 7 )) $(( (S / 7 + offset) % 2 * 30 )))"
  booked="$(api POST /app/appointments \
    "$(jq -nc --arg contact "${ASHA}" --arg branch "${VESU}" --arg doctor "${DOCTOR}" --arg date "$(calendar_day "${offset}")" --arg start "${SLOT}" \
      '{contact_id: $contact, branch_id: $branch, doctor_membership_id: $doctor, appointment_date: $date, start_time: $start, service_label: "Consultation"}')")"
  if [ "${booked%% *}" = 200 ]; then ASHA_VISIT="$(last '.data.id')"; break; fi
done
expect_equal "book Asha" "$([ -n "${ASHA_VISIT}" ] && echo booked)" booked
task_sql "UPDATE app.appointments SET appointment_date = '$(calendar_day 1)' WHERE public_id = '${ASHA_VISIT}';" >/dev/null
expect_equal "the booking is tomorrow" "$(task_sql "SELECT appointment_date FROM app.appointments WHERE public_id = '${ASHA_VISIT}';")" "$(calendar_day 1)"

run_task_rules
rule_tasks confirm "appointment_id=${ASHA_VISIT}"
expect_value "a Confirm task for the booking, the front desk queue" '[(.data | length), .data[0].kind, .data[0].title, .data[0].owner_role, .data[0].branch_id, .data[0].contact.id, .data[0].can_clinozy_handle] | map(tostring) | join(",")' "1,rule,Confirm Asha's visit,front_desk,${VESU},${ASHA},true"
CONFIRM_TASK="$(last '.data[0].id')"
rule_tasks follow_up "lead_id=${BELA_LEAD}"
expect_value "a Follow-up task, the lead's owner" '[(.data | length), .data[0].title, .data[0].owner_membership_id, .data[0].priority] | map(tostring) | join(",")' "1,Follow up with Bela,${COUNSELLOR},normal"
FOLLOW_UP_TASK="$(last '.data[0].id')"
run_task_rules
rule_tasks confirm "appointment_id=${ASHA_VISIT}"
expect_value "run again: still one (TK4)" '.data | length' 1

# A rule's task is never changed or deleted by hand (TK7, TK9).
as_role owner
expect 409 "change a rule's task" PATCH "/app/tasks/${CONFIRM_TASK}" '{"title":"Mine now"}'
expect_value "rule task: why" "${REASON}" rule_task
expect 409 "delete a rule's task" DELETE "/app/tasks/${CONFIRM_TASK}?reason=not_needed"

# Its record changes — the task closes itself, "Done by Clinozy".
expect 200 "confirm Asha's booking" POST "/app/appointments/${ASHA_VISIT}/confirm"
run_task_rules
expect 200 "the Confirm task" GET "/app/tasks/${CONFIRM_TASK}"
expect_value "closed by Clinozy" '[.data.status, .data.outcome, .data.result_text, .data.is_resolved_automatically, .data.resolved_by_membership_id] | map(tostring) | join(",")' "done,done,Done by Clinozy,true,null"

# A snoozed task wakes when its time comes.
as_role counsellor
expect 200 "snooze the follow-up for a moment" POST "/app/tasks/${FOLLOW_UP_TASK}/snooze" "$(jq -nc --arg until "$(instant '+2 seconds')" '{snoozed_until: $until}')"
sleep 3
run_task_rules
expect 200 "the follow-up task" GET "/app/tasks/${FOLLOW_UP_TASK}"
expect_value "awake (TK7)" '[.data.status, .data.snoozed_until] | map(tostring) | join(",")' open,null

# A rule that is off hides its open tasks and opens none; on again, they show.
as_role owner
expect 200 "turn follow-up off" PUT /app/task-rule-settings "$(rules '.rules |= map(if .rule_key == "follow_up" then .is_on = false else . end)')"
expect 200 "hidden from To do" GET "/app/tasks?scope=everyone&lead_id=${BELA_LEAD}"
expect_value "none shown" '.data | length' 0
expect 200 "move the follow-up a week out" PATCH "/app/leads/${BELA_LEAD}" "$(jq -nc --arg at "$(instant '+7 days')" '{follow_up_at: $at}')"
run_task_rules
expect_equal "an off rule's task still closes when its record changes" "$(task_sql "SELECT t.status || ',' || t.result_text FROM app.tasks t WHERE t.public_id = '${FOLLOW_UP_TASK}';")" "done,Done by Clinozy"
expect 200 "the follow-up date is back to yesterday" PATCH "/app/leads/${BELA_LEAD}" "$(jq -nc --arg at "$(instant '-1 day')" '{follow_up_at: $at}')"
run_task_rules
expect_equal "off: no new task" "$(task_sql "SELECT count(*) FROM app.tasks t JOIN app.leads l ON l.id = t.lead_id WHERE l.public_id = '${BELA_LEAD}' AND t.rule_key = 'follow_up' AND t.status <> 'done';")" 0
expect 200 "turn it on" PUT /app/task-rule-settings "$(rules '.')"
run_task_rules
rule_tasks follow_up "lead_id=${BELA_LEAD}"
expect_value "on: a fresh one" '.data | length' 1

# A call-back closes when a feedback action is logged (8 TR4).
expect 200 "Asha's patient file" POST /app/patients "$(jq -nc --arg contact "${ASHA}" --arg branch "${VESU}" '{contact_id: $contact, home_branch_id: $branch}')"
ASHA_FILE="$(last '.data.id')"
expect 200 "a worse check-in" POST "/app/patients/${ASHA_FILE}/check-ins" '{"feel":"worse","score":3,"context":"Phone call"}'
WORSE="$(last '.data.id')"
rule_tasks call_back "contact_id=${ASHA}"
expect_value "a call-back for the doctor queue, high" '[(.data | length), .data[0].owner_role, .data[0].priority, .data[0].patient_check_in_id] | map(tostring) | join(",")' "1,doctor,high,${WORSE}"
CALL_BACK="$(last '.data[0].id')"
expect 200 "the doctor called" POST "/app/patients/${ASHA_FILE}/check-ins/${WORSE}/actions" '{"action":"doctor_called"}'
run_task_rules
expect 200 "the call-back" GET "/app/tasks/${CALL_BACK}"
expect_value "closed by Clinozy" '[.data.status, .data.result_text] | join(",")' "done,Done by Clinozy"

# "Let Clinozy handle" a payment due (TK10): the reminder goes out on WhatsApp, the task closes.
expect 200 "offering Consult" POST /app/offerings "$(jq -nc --arg name "Tasks consult ${S}" '{name: $name, category: "consultation", price: 500}')"
CONSULT="$(last '.data.id')"
expect 200 "Bela's patient file (a clinic bill needs one)" POST /app/patients "$(jq -nc --arg contact "${BELA}" --arg branch "${VESU}" '{contact_id: $contact, home_branch_id: $branch}')"
expect 200 "let Clinozy handle payment due" PUT /app/task-rule-settings "$(rules '.rules |= map(if .rule_key == "payment_due" then .is_automatic = true else . end)')"
expect 200 "bill Bela, unpaid, two days ago" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${BELA}" --arg offering "${CONSULT}" --arg date "$(calendar_day -2)" \
    '{branch_id: $branch, contact_id: $contact, invoice_date: $date, items: [{offering_id: $offering, quantity: 1}]}')"
BELA_BILL_NUMBER="$(last '.data.invoice_number')"
run_task_rules
rule_tasks payment_due "contact_id=${BELA}" done
expect_value "Clinozy took it" '[(.data | length), .data[0].result_text, .data[0].is_resolved_automatically, (.data[0].invoice_id | startswith("inv"))] | map(tostring) | join(",")' "1,Done by Clinozy,true,true"
expect 200 "Bela's stream" GET "/app/contacts/${BELA}/activities?order=desc&limit=1"
expect_value "a queued reminder from Clinozy" '[.data[0].type, .data[0].direction, .data[0].delivery_status, .data[0].author_membership_id, (.data[0].body | contains("is still due on invoice '"${BELA_BILL_NUMBER}"'"))] | map(tostring) | join(",")' "whatsapp,sent,queued,null,true"
expect 200 "by hand again" PUT /app/task-rule-settings "$(rules '.')"
expect 200 "bill Asha, unpaid, two days ago" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg offering "${CONSULT}" --arg date "$(calendar_day -2)" \
    '{branch_id: $branch, contact_id: $contact, invoice_date: $date, items: [{offering_id: $offering, quantity: 1}]}')"
ASHA_BILL="$(last '.data.id')"
ASHA_DUE="$(last '.data.due_amount')"
run_task_rules
rule_tasks payment_due "contact_id=${ASHA}"
expect_value "by hand: open in the front desk queue" '[(.data | length), .data[0].owner_role, .data[0].status] | map(tostring) | join(",")' "1,front_desk,open"
PAYMENT_TASK="$(last '.data[0].id')"
expect 200 "Asha pays it all" POST /app/payments \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg invoice "${ASHA_BILL}" --argjson amount "${ASHA_DUE}" \
    '{kind: "receipt", branch_id: $branch, contact_id: $contact, invoice_id: $invoice, splits: [{mode: "cash", amount: $amount}]}')"
run_task_rules
expect 200 "the payment task" GET "/app/tasks/${PAYMENT_TASK}"
expect_value "nothing due: closed by Clinozy" '[.data.status, .data.result_text] | join(",")' "done,Done by Clinozy"
