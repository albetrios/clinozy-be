#!/usr/bin/env bash
# TEMPORARY — sub-domain 4, Contact activity (routes-final §4.C–4.D, launch ROUTE #130): the message
# templates, a contact's stream (send a message, log a call, add a note, read, resend, a batch), the
# contact's activity times, the record-link rules and M10's hiding, the gates by role. Sourced by
# run-live-api-checks.sh after live-api.sh; every name and number carries the run suffix.
S="${LIVE_API_RUN:-$(date +%s)}"
T="y${S}"
N="8${S: -7}"
NOWHERE_CONTACT=con_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_ENTRY=msg_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_TEMPLATE=mtpl_aaaaaaaaaaaaaaaaaaaaa
FIELDS='[.error.errors[].field] | join(",")'
TYPES='[.data[].type] | join(",")'
LONG_BODY="$(printf 'a%.0s' $(seq 1 1001))"

# person FIRST SUFFIX — a contact of this run with its own number; prints nothing, sets LAST_CONTACT.
person() {
  expect 200 "contact $1" POST /app/contacts "$(jq -nc --arg first "$1" --arg last "${T}" --arg phone "+91${N}$2" \
    '{first_name: $first, last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
  LAST_CONTACT="$(last '.data.id')"
}

as_role owner
OWNER_MEMBERSHIP="$(compose_sql <<SQL
SELECT m.public_id FROM tenancy.memberships m JOIN auth.users u ON u.id = m.user_id
 JOIN tenancy.organizations o ON o.id = m.organization_id
 WHERE o.public_id = '$(fixture '.organization_id')' AND u.email = '$(fixture '.members.owner.email')';
SQL
)"
person Asha 01
ASHA="${LAST_CONTACT}"
person Bela 02
BELA="${LAST_CONTACT}"
person Chirag 03
CHIRAG="${LAST_CONTACT}"

# ---- 4.D Contact message templates (routes 17–22) -----------------------------------------------
expect 200 "template create (default whatsapp)" POST /app/contact-message-templates "{\"name\":\"Hello ${T}\",\"body\":\"Hi <first>, about <interest>.\"}"
HELLO="$(last '.data.id')"
expect_value "template: type defaults to whatsapp" '.data.type' whatsapp
expect 200 "template create instagram" POST /app/contact-message-templates "{\"name\":\"Insta ${T}\",\"body\":\"Hey <first>\",\"type\":\"instagram\"}"
INSTA="$(last '.data.id')"
expect 409 "template name taken in another case" POST /app/contact-message-templates "{\"name\":\"HELLO ${T}\",\"body\":\"x\"}"
expect 400 "template empty body" POST /app/contact-message-templates "{\"name\":\"Empty ${T}\",\"body\":\" \"}"
expect 400 "template body over 1000" POST /app/contact-message-templates "{\"name\":\"Long ${T}\",\"body\":\"${LONG_BODY}\"}"
expect 400 "template type sms" POST /app/contact-message-templates "{\"name\":\"Sms ${T}\",\"body\":\"x\",\"type\":\"sms\"}"
NO_IDEMPOTENCY_KEY=1 expect 422 "template create without X-Idempotency-Key" POST /app/contact-message-templates "{\"name\":\"Nokey ${T}\",\"body\":\"x\"}"
expect 200 "template list (newest first)" GET "/app/contact-message-templates?q=${T}"
expect_value "template list order" '[.data[].name | rtrimstr(" '"${T}"'")] | join(",")' "Insta,Hello"
expect_value "template list total" '.meta.pagination.estimated_total' 2
expect 200 "template list by name" GET "/app/contact-message-templates?q=${T}&sort=name&order=asc"
expect_value "template list by name order" '[.data[].name | rtrimstr(" '"${T}"'")] | join(",")' "Hello,Insta"
expect 200 "template list by type" GET "/app/contact-message-templates?q=${T}&type=instagram"
expect_value "template type filter" '.data | length' 1
expect 200 "template get" GET "/app/contact-message-templates/${INSTA}"
UPDATED_AT="$(last '.data.updated_at')"
expect 404 "template get unknown" GET "/app/contact-message-templates/${NOWHERE_TEMPLATE}"
expect 200 "template change body" PATCH "/app/contact-message-templates/${INSTA}" "{\"body\":\"Hey <first>!\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 409 "template stale save" PATCH "/app/contact-message-templates/${INSTA}" "{\"name\":\"X ${T}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "template stale: record_changed" '.error.reason' record_changed
expect 400 "template PATCH nothing" PATCH "/app/contact-message-templates/${INSTA}" '{}'
expect 400 "template delete without reason" DELETE "/app/contact-message-templates/${INSTA}"
expect 204 "template delete" DELETE "/app/contact-message-templates/${INSTA}?reason=not_needed"
expect 404 "template get deleted" GET "/app/contact-message-templates/${INSTA}"
expect 200 "template name free again" POST /app/contact-message-templates "{\"name\":\"Insta ${T}\",\"body\":\"y\",\"type\":\"instagram\"}"
INSTA_AGAIN="$(last '.data.id')"
expect 409 "template restore over a reused name" POST "/app/contact-message-templates/${INSTA}/restore"
expect_value "template restore conflict reason" '.error.reason' record_restore_conflict
expect 204 "template delete the reuse" DELETE "/app/contact-message-templates/${INSTA_AGAIN}?reason=duplicate"
expect 200 "template restore" POST "/app/contact-message-templates/${INSTA}/restore"
expect 409 "template restore live" POST "/app/contact-message-templates/${INSTA}/restore"
expect_value "template restore live reason" '.error.reason' record_not_deleted

# ---- 4.C Send a message (route 11) ------------------------------------------------------------
expect 200 "send WhatsApp with a template" POST "/app/contacts/${ASHA}/activities/send-message" \
  "{\"type\":\"whatsapp\",\"body\":\"Hi <first>, about <interest>.\",\"contact_message_template_id\":\"${HELLO}\"}"
FIRST_MESSAGE="$(last '.data.id')"
expect_value "send: placeholders filled" '.data.body' "Hi Asha, about ."
expect_value "send: sent and queued" '[.data.direction, .data.delivery_status] | join(",")' "sent,queued"
expect_value "send: the caller is the author" '.data.author_membership_id' "${OWNER_MEMBERSHIP}"
expect_value "send: group messages" '.data.group' messages
expect 400 "send with an instagram template on WhatsApp" POST "/app/contacts/${ASHA}/activities/send-message" \
  "{\"type\":\"whatsapp\",\"body\":\"x\",\"contact_message_template_id\":\"${INSTA}\"}"
expect_value "template type: field" "${FIELDS}" contact_message_template_id
expect 400 "send with an unknown template" POST "/app/contacts/${ASHA}/activities/send-message" \
  "{\"type\":\"whatsapp\",\"body\":\"x\",\"contact_message_template_id\":\"${NOWHERE_TEMPLATE}\"}"
expect 400 "send a call_log type" POST "/app/contacts/${ASHA}/activities/send-message" '{"type":"call_log","body":"x"}'
expect 400 "send an empty body" POST "/app/contacts/${ASHA}/activities/send-message" '{"type":"whatsapp","body":"  "}'
expect 400 "send a body over 1000" POST "/app/contacts/${ASHA}/activities/send-message" "{\"type\":\"whatsapp\",\"body\":\"${LONG_BODY}\"}"
expect 400 "send with two record links" POST "/app/contacts/${ASHA}/activities/send-message" \
  '{"type":"whatsapp","body":"x","task_id":"tsk_aaaaaaaaaaaaaaaaaaaaa","invoice_id":"inv_aaaaaaaaaaaaaaaaaaaaa"}'
expect 400 "send linked to an unknown task" POST "/app/contacts/${ASHA}/activities/send-message" \
  '{"type":"whatsapp","body":"x","task_id":"tsk_aaaaaaaaaaaaaaaaaaaaa"}'
expect_value "unknown link: field" "${FIELDS}" task_id
expect 400 "send with an unconfirmed upload" POST "/app/contacts/${ASHA}/activities/send-message" \
  '{"type":"whatsapp","body":"x","attachment_keys":["organizations/none/uploads/nothing.jpg"]}'
expect_value "unconfirmed upload: field" "${FIELDS}" attachment_keys
expect 400 "send with an unknown field" POST "/app/contacts/${ASHA}/activities/send-message" '{"type":"whatsapp","body":"x","channel":"sms"}'
NO_IDEMPOTENCY_KEY=1 expect 422 "send without X-Idempotency-Key" POST "/app/contacts/${ASHA}/activities/send-message" '{"type":"whatsapp","body":"x"}'
expect 404 "send to an unknown contact" POST "/app/contacts/${NOWHERE_CONTACT}/activities/send-message" '{"type":"whatsapp","body":"x"}'
expect 200 "send Instagram replying in the stream" POST "/app/contacts/${ASHA}/activities/send-message" \
  "{\"type\":\"instagram\",\"body\":\"Following up\",\"reply_to_contact_activity_id\":\"${FIRST_MESSAGE}\"}"
expect_value "reply: same stream kept" '.data.reply_to_contact_activity_id' "${FIRST_MESSAGE}"
expect 400 "reply to another contact's entry" POST "/app/contacts/${BELA}/activities/send-message" \
  "{\"type\":\"whatsapp\",\"body\":\"x\",\"reply_to_contact_activity_id\":\"${FIRST_MESSAGE}\"}"
expect_value "reply other contact: field" "${FIELDS}" reply_to_contact_activity_id
expect 200 "Asha after the sends" GET "/app/contacts/${ASHA}"
expect_value "default channel follows the last send (CT4)" '.data.default_channel' instagram
expect_value "not awaiting a reply" '.data.is_awaiting_reply' false

# ---- 4.C Log a call, add a note (routes 12–13) --------------------------------------------------
expect 200 "log an incoming call" POST "/app/contacts/${ASHA}/activities/log-call" '{"direction":"received","body":"Asked about prices"}'
expect_value "incoming call: no author" '.data.author_membership_id' null
expect_value "incoming call: no delivery status" '.data.delivery_status' null
expect 200 "Asha awaits a reply" GET "/app/contacts/${ASHA}"
expect_value "awaiting a reply (M3)" '.data.is_awaiting_reply' true
expect 200 "contacts awaiting a reply" GET "/app/contacts?is_awaiting_reply=true&q=${T}"
expect_value "awaiting list: Asha" '[.data[].first_name] | join(",")' Asha
expect 400 "log a call without direction" POST "/app/contacts/${ASHA}/activities/log-call" '{"body":"x"}'
expect 200 "log an outgoing call" POST "/app/contacts/${BELA}/activities/log-call" '{"direction":"sent","body":"Called back"}'
expect_value "outgoing call: the caller is the author" '.data.author_membership_id' "${OWNER_MEMBERSHIP}"
expect 200 "Bela after the call" GET "/app/contacts/${BELA}"
expect_value "a call moves the channel to call" '.data.default_channel' call
expect 200 "add a note" POST "/app/contacts/${ASHA}/activities/add-note" '{"body":"Prefers mornings"}'
expect_value "note: no direction" '.data.direction' null
expect 400 "note with a type" POST "/app/contacts/${ASHA}/activities/add-note" '{"body":"x","type":"note"}'

# ---- 4.C The stream (routes 10, 14) -------------------------------------------------------------
expect 200 "stream, oldest first" GET "/app/contacts/${ASHA}/activities"
expect_value "stream order" "${TYPES}" "whatsapp,instagram,call_log,note"
expect_value "stream total" '.meta.pagination.estimated_total' 4
expect 200 "stream newest first" GET "/app/contacts/${ASHA}/activities?order=desc&limit=2"
expect_value "newest page" "${TYPES}" "note,call_log"
STREAM_PAGES=""
AFTER=""
while :; do
  api GET "/app/contacts/${ASHA}/activities?limit=1${AFTER:+&after=${AFTER}}" >/dev/null
  STREAM_PAGES+="$(last "${TYPES}"),"
  AFTER="$(last '.meta.pagination.next // empty')"
  [ -n "${AFTER}" ] || break
done
expect_equal "stream paged 1 by 1" "${STREAM_PAGES%,}" "whatsapp,instagram,call_log,note"
expect 200 "stream by type (several)" GET "/app/contacts/${ASHA}/activities?type=note,call_log"
expect_value "type filter" "${TYPES}" "call_log,note"
expect 200 "stream group messages" GET "/app/contacts/${ASHA}/activities?group=messages"
expect_value "group filter" '.data | length' 4
expect 200 "stream received" GET "/app/contacts/${ASHA}/activities?direction=received"
expect_value "direction filter" "${TYPES}" call_log
expect 200 "stream queued" GET "/app/contacts/${ASHA}/activities?delivery_status=queued"
expect_value "delivery filter" '.data | length' 2
expect 200 "stream text search" GET "/app/contacts/${ASHA}/activities?q=prices"
expect_value "q filter" "${TYPES}" call_log
expect 200 "stream sorted by created_at" GET "/app/contacts/${ASHA}/activities?sort=created_at&order=desc&limit=1"
expect_value "created_at sort" "${TYPES}" note
expect 400 "stream bad group" GET "/app/contacts/${ASHA}/activities?group=chat"
expect 400 "stream bad type" GET "/app/contacts/${ASHA}/activities?type=sms"
expect 200 "stream of a contact with none" GET "/app/contacts/${CHIRAG}/activities"
expect_value "empty stream" '.data | length' 0
expect 404 "stream of an unknown contact" GET "/app/contacts/${NOWHERE_CONTACT}/activities"
expect 200 "get an entry" GET "/app/contacts/${ASHA}/activities/${FIRST_MESSAGE}"
expect 404 "get an entry under another contact" GET "/app/contacts/${BELA}/activities/${FIRST_MESSAGE}"
expect 404 "get an unknown entry" GET "/app/contacts/${ASHA}/activities/${NOWHERE_ENTRY}"

# ---- 4.C Resend (route 15) ----------------------------------------------------------------------
expect 409 "resend a queued message" POST "/app/contacts/${ASHA}/activities/${FIRST_MESSAGE}/resend"
expect_value "resend queued: transition_not_allowed" '.error.reason' transition_not_allowed
compose_sql <<SQL
UPDATE app.contact_activities SET delivery_status = 'failed', failure_reason = 'Number not on WhatsApp',
  failed_at = now() WHERE public_id = '${FIRST_MESSAGE}';
SQL
expect 404 "resend under another contact" POST "/app/contacts/${BELA}/activities/${FIRST_MESSAGE}/resend"
expect 200 "resend a failed message" POST "/app/contacts/${ASHA}/activities/${FIRST_MESSAGE}/resend"
expect_value "resent: queued, failure cleared" '[.data.delivery_status, (.data.failure_reason // "none")] | join(",")' "queued,none"
NOTE_ID="$(api GET "/app/contacts/${ASHA}/activities?type=note" >/dev/null; last '.data[0].id')"
expect 409 "resend a note" POST "/app/contacts/${ASHA}/activities/${NOTE_ID}/resend"

# ---- 4.C Message batch (route 16) ---------------------------------------------------------------
expect 200 "batch to two contacts" POST /app/contact-activities/message-batches \
  "{\"contact_ids\":[\"${BELA}\",\"${CHIRAG}\"],\"type\":\"whatsapp\",\"body\":\"Hi <first>, offer this week\",\"contact_message_template_id\":\"${HELLO}\"}"
expect_value "batch: one per contact, filled" '[.data[].body] | join("|")' "Hi Bela, offer this week|Hi Chirag, offer this week"
expect 400 "batch repeats a contact" POST /app/contact-activities/message-batches "{\"contact_ids\":[\"${BELA}\",\"${BELA}\"],\"type\":\"whatsapp\",\"body\":\"x\"}"
expect 400 "batch with an unknown contact" POST /app/contact-activities/message-batches "{\"contact_ids\":[\"${BELA}\",\"${NOWHERE_CONTACT}\"],\"type\":\"whatsapp\",\"body\":\"x\"}"
expect_value "batch unknown: field" "${FIELDS}" contact_ids
expect 400 "batch with a template of the other type" POST /app/contact-activities/message-batches "{\"contact_ids\":[\"${BELA}\"],\"type\":\"whatsapp\",\"body\":\"x\",\"contact_message_template_id\":\"${INSTA}\"}"
expect 400 "batch of 201" POST /app/contact-activities/message-batches \
  "$(jq -nc --arg id "${BELA}" '{contact_ids: [range(0;201) | "con_\(.)aaaaaaaaaaaaaaaaaa"], type: "whatsapp", body: "x"}')"
expect 200 "Chirag after the batch" GET "/app/contacts/${CHIRAG}"
expect_value "batch moves the last sent time" '.data.last_sent_at != null' true

# ---- M10: an entry linked to a record the caller cannot read is hidden --------------------------
PATIENT="$(api POST /app/patients "$(jq -nc --arg last "${T}" --arg phone "+91${N}09" --arg branch "$(fixture '.branches.vesu')" \
  '{contact: {first_name: "Clin", last_name: $last, phones: [{phone: $phone, is_primary: true}]}, home_branch_id: $branch}')" >/dev/null; last '.data.id')"
CLINICAL_NOTE="$(api POST "/app/patients/${PATIENT}/clinical-notes" '{"kind":"complaint","text":"Acne flare"}' >/dev/null; last '.data.id')"
expect 200 "note linked to a clinical note" POST "/app/contacts/${CHIRAG}/activities/add-note" "{\"body\":\"See the complaint\",\"patient_clinical_note_id\":\"${CLINICAL_NOTE}\"}"
LINKED_NOTE="$(last '.data.id')"
expect_value "linked note keeps its link" '.data.patient_clinical_note_id' "${CLINICAL_NOTE}"
expect 200 "owner sees the linked note" GET "/app/contacts/${CHIRAG}/activities?type=note"
expect_value "owner: one linked note" '.data | length' 1

# ---- Gates by role (M4: Activity for every role but the Accountant; delete Owner and Admin) -----
as_role marketing
expect 200 "marketing: stream" GET "/app/contacts/${CHIRAG}/activities"
expect_value "marketing: the clinical-linked note is hidden (M10)" '[.data[] | select(.id == "'"${LINKED_NOTE}"'")] | length' 0
expect 404 "marketing: get the hidden note" GET "/app/contacts/${CHIRAG}/activities/${LINKED_NOTE}"
expect 200 "marketing: add a note" POST "/app/contacts/${CHIRAG}/activities/add-note" '{"body":"Liked the post"}'
expect 200 "marketing: templates" GET "/app/contact-message-templates?q=${T}"
expect 403 "marketing: delete a template" DELETE "/app/contact-message-templates/${HELLO}?reason=mistake"
as_role accountant
expect 403 "accountant: stream" GET "/app/contacts/${CHIRAG}/activities"
expect 403 "accountant: send" POST "/app/contacts/${CHIRAG}/activities/send-message" '{"type":"whatsapp","body":"x"}'
expect 200 "accountant: templates (every member)" GET "/app/contact-message-templates?q=${T}"
expect 403 "accountant: add a template" POST /app/contact-message-templates "{\"name\":\"Acc ${T}\",\"body\":\"x\"}"
as_role front_desk
expect 200 "front desk: read an entry" GET "/app/contacts/${ASHA}/activities/${FIRST_MESSAGE}"
expect 200 "front desk: edit a template" PATCH "/app/contact-message-templates/${HELLO}" '{"body":"Hello <first>"}'
expect 403 "front desk: delete a template" DELETE "/app/contact-message-templates/${HELLO}?reason=mistake"
as_role admin
expect 204 "admin: delete a template" DELETE "/app/contact-message-templates/${HELLO}?reason=mistake"
as_role owner
expect 204 "owner: delete Chirag (the stream stays with the contact)" DELETE "/app/contacts/${CHIRAG}?reason=mistake"
expect 404 "stream of a deleted contact" GET "/app/contacts/${CHIRAG}/activities"
