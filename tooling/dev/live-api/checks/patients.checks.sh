#!/usr/bin/env bash
# TEMPORARY — sub-domain 7, Patients 7.A–7.G (routes-final §7, launch ROUTE #133): the patient file
# on its contact, one per contact, check-in opening one, the list's search, filters, sorts and
# export; clinical notes, prescriptions and their approval, kits, the diagnosis catalogue, photos in
# three albums, reports; the clinical gates (P14), the private album (P23) and the `system` entries
# in the contact's activity (M10). Sourced by run-live-api-checks.sh after live-api.sh; every name
# and number carries the run suffix.
S="${LIVE_API_RUN:-$(date +%s)}"
# This run's last name — `q=${T}` lists only this run's patient files (through their contacts).
T="x${S}"
# Ten-digit numbers unique to the run: 7 + the run's last 7 digits + two more — 51 to 59 here, the
# leads checks (also 7…) keep below 50.
N="7${S: -7}"
NOWHERE_CONTACT=con_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_PATIENT=pat_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_MEMBERSHIP=mem_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_MEDICINE=med_aaaaaaaaaaaaaaaaaaaaa
NOWHERE_TREATMENT=trt_aaaaaaaaaaaaaaaaaaaaa
FIELDS='[.error.errors[].field] | join(",")'
REASON='.error.reason'
ORGANIZATION="$(fixture '.organization_id')"
VESU="$(fixture '.branches.vesu')"
ADAJAN="$(fixture '.branches.adajan')"
OWNER_EMAIL="$(fixture '.members.owner.email')"
ADMIN="$(fixture '.members.admin.membership_id')"
DOCTOR="$(fixture '.members.doctor.membership_id')"
TODAY="$(calendar_day 0)"
TOMORROW="$(calendar_day 1)"
DELETE_REASON='reason=mistake'

# person FIRST SUFFIX — a contact of this run with its own number; sets LAST_CONTACT.
person() {
  expect 200 "contact $1" POST /app/contacts "$(jq -nc --arg first "$1" --arg last "${T}" --arg phone "+91${N}$2" \
    '{first_name: $first, last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
  LAST_CONTACT="$(last '.data.id')"
}

# patient_sql SQL — one statement in the Compose database (a state the API never writes).
patient_sql() { compose_sql <<<"$1"; }

# confirmed_upload NAME MIME BYTES — a confirmed upload of the fixture organization (the S3 round
# trip is out of reach here); prints its key (NAME is unique within a run).
confirmed_upload() {
  local key="organizations/${ORGANIZATION}/uploads/${T}-$1"
  local public_id
  public_id="upl_$(printf '%s' "${key}" | md5sum | head -c 21)"
  patient_sql "INSERT INTO upload.uploads (public_id, user_id, organization_id, file_name, file_key, mime_type, file_size, bucket, status, uploaded_at)
    SELECT '${public_id}', u.id, o.id, '$1', '${key}', '$2', $3, 'local', 'UPLOADED', now()
    FROM tenancy.organizations o, auth.users u
    WHERE o.public_id = '${ORGANIZATION}' AND u.email = '${OWNER_EMAIL}';" >/dev/null
  printf '%s' "${key}"
}

as_role owner
person Asha 51
ASHA="${LAST_CONTACT}"
person Bina 52
BINA="${LAST_CONTACT}"
person Chetan 53
CHETAN="${LAST_CONTACT}"
person Dev 54
DEV="${LAST_CONTACT}"

# ---- 7.A Create (route 3, P1) ---------------------------------------------------------------------
expect 200 "create Asha's file (doctor, types, allergies)" POST /app/patients \
  "$(jq -nc --arg contact "${ASHA}" --arg branch "${VESU}" --arg doctor "${DOCTOR}" \
    '{contact_id: $contact, home_branch_id: $branch, doctor_membership_id: $doctor, types: ["aesthetic", "lhr"], allergies: ["Penicillin"], notes: "Prefers mornings"}')"
ASHA_FILE="$(last '.data.id')"
ASHA_NUMBER="$(last '.data.patient_number')"
expect_value "create: the contact only (P3)" '[.data.contact_id, (.data | has("contact")), (.data | has("first_name"))] | map(tostring) | join(",")' "${ASHA},false,false"
expect_value "create: new, not converted (P4)" '[.data.status, .data.conversion, (.data.lead_id | tostring)] | join(",")' new,not_converted,null
expect_value "create: numbered" '.data.patient_number > 0' true
expect 200 "the usual doctor handles the contact (7.10)" GET "/app/contacts/${ASHA}"
expect_value "doctor on the contact's team" "[.data.member_membership_ids[] | select(. == \"${DOCTOR}\")] | length" 1
expect 409 "a second file for Asha" POST /app/patients "{\"contact_id\":\"${ASHA}\",\"home_branch_id\":\"${VESU}\"}"
expect_value "second file: why" "[${REASON}, (.error.detail | test(\"PT-\"))] | map(tostring) | join(\",\")" contact_is_patient,true
expect 400 "contact_id and contact both" POST /app/patients \
  "$(jq -nc --arg contact "${BINA}" --arg branch "${VESU}" '{contact_id: $contact, contact: {first_name: "Both", phones: [{phone: "+919999999999", is_primary: true}]}, home_branch_id: $branch}')"
expect_value "both: field" "${FIELDS}" body.contact_id
expect 400 "neither contact_id nor contact" POST /app/patients "{\"home_branch_id\":\"${VESU}\"}"
expect 400 "no home branch" POST /app/patients "{\"contact_id\":\"${BINA}\"}"
expect_value "no home branch: field" "${FIELDS}" body.home_branch_id
expect 400 "an unknown contact" POST /app/patients "{\"contact_id\":\"${NOWHERE_CONTACT}\",\"home_branch_id\":\"${VESU}\"}"
expect 400 "an unknown doctor" POST /app/patients "{\"contact_id\":\"${BINA}\",\"home_branch_id\":\"${VESU}\",\"doctor_membership_id\":\"${NOWHERE_MEMBERSHIP}\"}"
expect_value "unknown doctor: field" "${FIELDS}" doctor_membership_id
expect 400 "a person field on the file (P2)" POST /app/patients "{\"contact_id\":\"${BINA}\",\"home_branch_id\":\"${VESU}\",\"first_name\":\"Bina\"}"
expect 400 "a seventh type" POST /app/patients "{\"contact_id\":\"${BINA}\",\"home_branch_id\":\"${VESU}\",\"types\":[\"aesthetic\",\"aesthetic\"]}"
NO_IDEMPOTENCY_KEY=1 expect 422 "create without X-Idempotency-Key" POST /app/patients "{\"contact_id\":\"${BINA}\",\"home_branch_id\":\"${VESU}\"}"
expect 200 "create Bina's file at Adajan" POST /app/patients "{\"contact_id\":\"${BINA}\",\"home_branch_id\":\"${ADAJAN}\",\"types\":[\"clinical\"],\"status\":\"vip\",\"follow_up_at\":\"2030-01-02T10:00:00+05:30\"}"
BINA_FILE="$(last '.data.id')"
expect 200 "create with a new contact (P1)" POST /app/patients \
  "$(jq -nc --arg last "${T}" --arg phone "+91${N}55" --arg branch "${VESU}" '{contact: {first_name: "Esha", last_name: $last, phones: [{phone: $phone, is_primary: true}]}, home_branch_id: $branch, types: ["dental"]}')"
ESHA_FILE="$(last '.data.id')"
ESHA="$(last '.data.contact_id')"
expect_value "inline contact: a new con_ id" "[(.data.contact_id | startswith(\"con_\")), (.data.contact_id != \"${ASHA}\")] | map(tostring) | join(\",\")" true,true
expect 409 "an inline contact on another household's number" POST /app/patients \
  "$(jq -nc --arg phone "+91${N}55" --arg branch "${VESU}" '{contact: {first_name: "Copy", phones: [{phone: $phone, is_primary: true}]}, home_branch_id: $branch}')"
expect_value "taken number: why" "${REASON}" contact_phone_exists

# ---- Check-in opens a file (A14, P4, P10) ------------------------------------------------------
expect 200 "Chetan's lead" POST /app/leads "{\"contact_id\":\"${CHETAN}\",\"interests\":[\"lhr\"]}"
CHETAN_LEAD="$(last '.data.id')"
expect 200 "Chetan walks in" POST /app/appointments \
  "$(jq -nc --arg contact "${CHETAN}" --arg branch "${VESU}" --arg doctor "${DOCTOR}" '{contact_id: $contact, branch_id: $branch, doctor_membership_id: $doctor, service_label: "Consultation", is_walk_in: true}')"
CHETAN_VISIT="$(last '.data.id')"
CHETAN_FILE="$(last '.data.patient_id')"
expect_value "the walk-in opened a file" '.data.patient_id | startswith("pat_")' true
expect 200 "Chetan's file" GET "/app/patients/${CHETAN_FILE}"
expect_value "opened at check-in: lead, branch, doctor, not converted (P4, P10)" '[.data.lead_id, .data.home_branch_id, .data.doctor_membership_id, .data.conversion] | join(",")' "${CHETAN_LEAD},${VESU},${DOCTOR},not_converted"

# ---- Read, list, export (routes 1, 2, 4) -------------------------------------------------------
expect 200 "get Asha's file" GET "/app/patients/${ASHA_FILE}"
expect_value "get: the fields" '[(.data.types | join("|")), (.data.allergies | join("|")), .data.notes] | join(",")' "aesthetic|lhr,Penicillin,Prefers mornings"
expect 404 "an unknown file" GET "/app/patients/${NOWHERE_PATIENT}"
expect 200 "list this run's files (q, the contacts' names)" GET "/app/patients?q=${T}&sort=patient_number&order=asc"
expect_value "q by name: four files, numbered order" '.data | length' 4
expect_value "the first is Asha's" '.data[0].id' "${ASHA_FILE}"
expect 200 "q: PT-number" GET "/app/patients?q=PT-$(printf '%04d' "${ASHA_NUMBER}")"
expect_value "PT-number: Asha" '[.data[].id] | join(",")' "${ASHA_FILE}"
expect 200 "q: #number" GET "/app/patients?q=%23${ASHA_NUMBER}"
expect_value "#number: Asha" '[.data[].id] | join(",")' "${ASHA_FILE}"
expect 200 "q: Bina's number" GET "/app/patients?q=${N}52"
expect_value "number: Bina" '[.data[].id] | join(",")' "${BINA_FILE}"
expect 400 "q too short" GET "/app/patients?q=ab"
expect 200 "types: any of them" GET "/app/patients?q=${T}&types=lhr,dental"
expect_value "types lhr or dental: Asha, Esha" '[.data[].id] | sort | join(",")' "$(printf '%s\n' "${ASHA_FILE}" "${ESHA_FILE}" | sort | paste -sd,)"
expect 200 "status vip" GET "/app/patients?q=${T}&status=vip"
expect_value "vip: Bina" '[.data[].id] | join(",")' "${BINA_FILE}"
expect 200 "home branch Adajan" GET "/app/patients?q=${T}&home_branch_id=${ADAJAN}"
expect_value "Adajan: Bina" '[.data[].id] | join(",")' "${BINA_FILE}"
expect 200 "doctor" GET "/app/patients?q=${T}&doctor_membership_id=${DOCTOR}"
expect_value "doctor's: Asha, Chetan" '.data | length' 2
expect 200 "contact" GET "/app/patients?contact_id=${CHETAN}"
expect_value "contact: Chetan" '[.data[].id] | join(",")' "${CHETAN_FILE}"
expect 200 "conversion" GET "/app/patients?q=${T}&conversion=converted"
expect_value "none converted yet" '.data | length' 0
expect 200 "sort follow_up_at: a file without one last" GET "/app/patients?q=${T}&sort=follow_up_at"
expect_value "follow-up first: Bina" '.data[0].id' "${BINA_FILE}"
expect 400 "an unknown sort" GET "/app/patients?sort=first_name"
expect 200 "export" GET "/app/patients/exports?q=${T}"
expect_value "export: four rows with the contact's name and number" '[.data.row_count, (.data.content | test("contact_name")), (.data.content | test("Asha '"${T}"'")), (.data.content | test("'"${N}"'51"))] | map(tostring) | join(",")' 4,true,true,true

# ---- Change (route 5) ---------------------------------------------------------------------------
UPDATED_AT="$(api GET "/app/patients/${ASHA_FILE}" >/dev/null; last '.data.updated_at')"
expect 200 "change Asha's file" PATCH "/app/patients/${ASHA_FILE}" "{\"status\":\"regular\",\"conversion\":\"converted\",\"contraindications\":[\"Pregnancy\"],\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "changed (conversion editable, P4)" '[.data.status, .data.conversion, (.data.contraindications | join("|"))] | join(",")' regular,converted,Pregnancy
expect 409 "a stale save" PATCH "/app/patients/${ASHA_FILE}" "{\"status\":\"vip\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect_value "stale: why" "${REASON}" record_changed
expect 400 "an empty change" PATCH "/app/patients/${ASHA_FILE}" '{}'
expect 400 "the contact cannot change" PATCH "/app/patients/${ASHA_FILE}" "{\"contact_id\":\"${DEV}\"}"
expect 400 "lead_id is read-only" PATCH "/app/patients/${ASHA_FILE}" "{\"lead_id\":\"${CHETAN_LEAD}\"}"
expect 200 "a new usual doctor" PATCH "/app/patients/${BINA_FILE}" "{\"doctor_membership_id\":\"${ADMIN}\"}"
expect 200 "Bina's contact" GET "/app/contacts/${BINA}"
expect_value "the new doctor handles Bina" "[.data.member_membership_ids[] | select(. == \"${ADMIN}\")] | length" 1

# ---- Delete and restore (routes 6, 7, P1, P7) ---------------------------------------------------
expect 204 "remove Esha's file" DELETE "/app/patients/${ESHA_FILE}?${DELETE_REASON}"
expect 404 "a removed file" GET "/app/patients/${ESHA_FILE}"
expect 404 "its notes with it" GET "/app/patients/${ESHA_FILE}/clinical-notes"
expect 400 "remove without a reason" DELETE "/app/patients/${BINA_FILE}"
expect 200 "a new file for Esha meanwhile" POST /app/patients "{\"contact_id\":\"${ESHA}\",\"home_branch_id\":\"${VESU}\"}"
ESHA_SECOND="$(last '.data.id')"
expect 409 "restore over the new one" POST "/app/patients/${ESHA_FILE}/restore"
expect_value "restore: why" "${REASON}" contact_is_patient
expect 204 "remove the new one" DELETE "/app/patients/${ESHA_SECOND}?${DELETE_REASON}"
expect 200 "restore the first" POST "/app/patients/${ESHA_FILE}/restore"
expect 409 "restore a live file" POST "/app/patients/${ESHA_FILE}/restore"
expect_value "live: why" "${REASON}" record_not_deleted
expect 409 "a contact with a file is not removed (CT7)" DELETE "/app/contacts/${ESHA}?${DELETE_REASON}"

# ---- 7.E The diagnosis catalogue (routes 27–32) -------------------------------------------------
expect 200 "add a diagnosis" POST /app/patient-diagnoses "{\"name\":\"Acne ${T}\"}"
DIAGNOSIS="$(last '.data.id')"
expect_value "dgn_ id" '.data.id | startswith("dgn_")' true
expect 409 "the same name in another case (P18)" POST /app/patient-diagnoses "{\"name\":\"ACNE ${T}\"}"
expect 200 "add another" POST /app/patient-diagnoses "{\"name\":\"Melasma ${T}\"}"
MELASMA="$(last '.data.id')"
expect 200 "the catalogue by name" GET "/app/patient-diagnoses?q=${T}"
expect_value "by name: Acne, Melasma" '[.data[].name] | join(",")' "Acne ${T},Melasma ${T}"
UPDATED_AT="$(last '.data[1].updated_at')"
expect 409 "rename onto another's name" PATCH "/app/patient-diagnoses/${MELASMA}" "{\"name\":\"acne ${T}\"}"
expect 200 "rename" PATCH "/app/patient-diagnoses/${MELASMA}" "{\"name\":\"Chloasma ${T}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 409 "a stale rename" PATCH "/app/patient-diagnoses/${MELASMA}" "{\"name\":\"Melasma ${T}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 204 "delete it" DELETE "/app/patient-diagnoses/${MELASMA}?${DELETE_REASON}"
expect 200 "its name reused" POST /app/patient-diagnoses "{\"name\":\"Chloasma ${T}\"}"
expect 409 "restore over the reused name" POST "/app/patient-diagnoses/${MELASMA}/restore"
expect_value "reused: why" "${REASON}" record_restore_conflict
as_role marketing
expect 200 "every member reads the catalogue" GET "/app/patient-diagnoses?q=${T}"
expect 200 "every member reads one" GET "/app/patient-diagnoses/${DIAGNOSIS}"
expect 403 "marketing adds none" POST /app/patient-diagnoses "{\"name\":\"Rosacea ${T}\"}"
as_role therapist
expect 403 "a therapist adds none (prescribers' catalogue)" POST /app/patient-diagnoses "{\"name\":\"Rosacea ${T}\"}"
as_role owner

# ---- 7.B Clinical notes (routes 8–12, P12, P14) ------------------------------------------------
expect 200 "a complaint" POST "/app/patients/${ASHA_FILE}/clinical-notes" '{"kind":"complaint","text":"Breakouts on both cheeks"}'
COMPLAINT="$(last '.data.id')"
expect_value "complaint: no visit, no catalogue entry" '[(.data.appointment_id | tostring), (.data.patient_diagnosis_id | tostring), .data.patient_id] | join(",")' "null,null,${ASHA_FILE}"
expect 200 "a diagnosis from the catalogue" POST "/app/patients/${ASHA_FILE}/clinical-notes" "{\"kind\":\"diagnosis\",\"text\":\"Grade 2 acne\",\"patient_diagnosis_id\":\"${DIAGNOSIS}\"}"
DIAGNOSIS_NOTE="$(last '.data.id')"
expect_value "diagnosis: its entry" '.data.patient_diagnosis_id' "${DIAGNOSIS}"
expect 400 "a catalogue entry on a complaint" POST "/app/patients/${ASHA_FILE}/clinical-notes" "{\"kind\":\"complaint\",\"text\":\"x\",\"patient_diagnosis_id\":\"${DIAGNOSIS}\"}"
expect_value "catalogue entry: field" "${FIELDS}" body.patient_diagnosis_id
expect 400 "a new kind is checked" POST "/app/patients/${ASHA_FILE}/clinical-notes" '{"kind":"rumour","text":"x"}'
expect 400 "a note of 501 characters" POST "/app/patients/${ASHA_FILE}/clinical-notes" "$(jq -nc '{kind: "finding", text: ("x" * 501)}')"
expect 200 "a safety check on Chetan's visit" POST "/app/patients/${CHETAN_FILE}/clinical-notes" "{\"kind\":\"safety_check\",\"text\":\"No allergies\",\"appointment_id\":\"${CHETAN_VISIT}\"}"
CHETAN_NOTE="$(last '.data.id')"
expect 400 "another patient's visit (TR3)" POST "/app/patients/${ASHA_FILE}/clinical-notes" "{\"kind\":\"finding\",\"text\":\"x\",\"appointment_id\":\"${CHETAN_VISIT}\"}"
expect_value "another's visit: field" "${FIELDS}" appointment_id
expect 200 "Asha's notes" GET "/app/patients/${ASHA_FILE}/clinical-notes"
expect_value "two notes, newest first" '[.data[].id] | join(",")' "${DIAGNOSIS_NOTE},${COMPLAINT}"
expect 200 "kind filter (several)" GET "/app/patients/${ASHA_FILE}/clinical-notes?kind=complaint,finding"
expect_value "kind: the complaint" '[.data[].id] | join(",")' "${COMPLAINT}"
expect 200 "q: the text" GET "/app/patients/${ASHA_FILE}/clinical-notes?q=cheeks"
expect_value "q: the complaint" '[.data[].id] | join(",")' "${COMPLAINT}"
expect 200 "a visit's notes" GET "/app/patients/${CHETAN_FILE}/clinical-notes?appointment_id=${CHETAN_VISIT}"
expect_value "visit: Chetan's note" '[.data[].id] | join(",")' "${CHETAN_NOTE}"
expect 200 "get one" GET "/app/patients/${ASHA_FILE}/clinical-notes/${COMPLAINT}"
expect 404 "under another patient" GET "/app/patients/${BINA_FILE}/clinical-notes/${COMPLAINT}"
expect 404 "notes are never edited (no PATCH)" PATCH "/app/patients/${ASHA_FILE}/clinical-notes/${COMPLAINT}" '{"text":"y"}'
expect 204 "delete a wrong note" DELETE "/app/patients/${ASHA_FILE}/clinical-notes/${COMPLAINT}?${DELETE_REASON}"
expect 404 "a deleted note" GET "/app/patients/${ASHA_FILE}/clinical-notes/${COMPLAINT}"
expect 200 "restore it" POST "/app/patients/${ASHA_FILE}/clinical-notes/${COMPLAINT}/restore"
expect 409 "restore a live note" POST "/app/patients/${ASHA_FILE}/clinical-notes/${COMPLAINT}/restore"
expect 200 "the contact's activity (M10)" GET "/app/contacts/${ASHA}/activities?type=system"
expect_value "a system entry per note" "[.data[] | select(.patient_clinical_note_id != null)] | length" 2
as_role front_desk
expect 403 "the front desk reads no notes (P14)" GET "/app/patients/${ASHA_FILE}/clinical-notes"
expect 403 "the front desk writes none (P14)" POST "/app/patients/${ASHA_FILE}/clinical-notes" '{"kind":"complaint","text":"x"}'
expect 200 "the front desk reads the file" GET "/app/patients/${ASHA_FILE}"
expect 200 "the front desk's activity" GET "/app/contacts/${ASHA}/activities?type=system"
expect_value "note entries hidden from the front desk (M10)" "[.data[] | select(.patient_clinical_note_id != null)] | length" 0
as_role therapist
expect 200 "a therapist writes a note" POST "/app/patients/${ASHA_FILE}/clinical-notes" '{"kind":"finding","text":"Mild erythema"}'
as_role owner

# ---- 7.C Prescriptions (routes 13–20, P15, P16) -------------------------------------------------
expect 200 "a manufacturer" POST /app/manufacturers "{\"name\":\"Pharma ${T}\"}"
MANUFACTURER="$(last '.data.id')"
expect 200 "a medicine" POST /app/medicines "{\"name\":\"Tretinoin ${T}\",\"manufacturer_id\":\"${MANUFACTURER}\",\"mrp\":120}"
MEDICINE="$(last '.data.id')"
LINE="$(jq -nc --arg medicine "${MEDICINE}" '{medicine_name: "Tretinoin 0.025%", medicine_id: $medicine, dose_night: 1, meal: "after", quantity: 1}')"
expect 200 "write a draft" POST "/app/patients/${ASHA_FILE}/prescriptions" \
  "$(jq -nc --arg doctor "${DOCTOR}" --arg day "${TODAY}" --argjson line "${LINE}" '{doctor_membership_id: $doctor, prescription_date: $day, items: [$line], advice: "Sunscreen daily"}')"
RX="$(last '.data.id')"
RX_NUMBER="$(last '.data.prescription_number')"
expect_value "draft: rx_, lines, no approver" '[(.data.id | startswith("rx_")), .data.status, (.data.items | length), (.data.approved_by_membership_id | tostring)] | map(tostring) | join(",")' true,draft,1,null
expect 400 "a line of no live medicine (P15)" POST "/app/patients/${ASHA_FILE}/prescriptions" \
  "$(jq -nc --arg doctor "${DOCTOR}" --arg day "${TODAY}" --arg medicine "${NOWHERE_MEDICINE}" '{doctor_membership_id: $doctor, prescription_date: $day, items: [{medicine_name: "Ghost", medicine_id: $medicine}]}')"
expect_value "no medicine: field" "${FIELDS}" items
expect 400 "31 lines (P16)" POST "/app/patients/${ASHA_FILE}/prescriptions" \
  "$(jq -nc --arg doctor "${DOCTOR}" --arg day "${TODAY}" '{doctor_membership_id: $doctor, prescription_date: $day, items: [range(0;31) | {medicine_name: "M"}]}')"
expect 400 "an unknown doctor" POST "/app/patients/${ASHA_FILE}/prescriptions" "{\"doctor_membership_id\":\"${NOWHERE_MEMBERSHIP}\",\"prescription_date\":\"${TODAY}\"}"
expect 400 "another patient's visit" POST "/app/patients/${ASHA_FILE}/prescriptions" "{\"doctor_membership_id\":\"${DOCTOR}\",\"prescription_date\":\"${TODAY}\",\"appointment_id\":\"${CHETAN_VISIT}\"}"
expect 200 "an empty draft" POST "/app/patients/${ASHA_FILE}/prescriptions" "{\"doctor_membership_id\":\"${DOCTOR}\",\"prescription_date\":\"${TODAY}\"}"
EMPTY_RX="$(last '.data.id')"
expect 400 "approve with no line" POST "/app/patients/${ASHA_FILE}/prescriptions/${EMPTY_RX}/approve"
expect_value "no line: field" "${FIELDS}" items
UPDATED_AT="$(api GET "/app/patients/${ASHA_FILE}/prescriptions/${RX}" >/dev/null; last '.data.updated_at')"
expect 200 "change the draft" PATCH "/app/patients/${ASHA_FILE}/prescriptions/${RX}" "{\"follow_up_date\":\"${TOMORROW}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 409 "a stale change" PATCH "/app/patients/${ASHA_FILE}/prescriptions/${RX}" "{\"advice\":\"x\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
as_role doctor
expect 200 "the doctor approves" POST "/app/patients/${ASHA_FILE}/prescriptions/${RX}/approve"
expect_value "approved by the doctor (P15)" '[.data.status, .data.approved_by_membership_id, (.data.approved_at != null)] | map(tostring) | join(",")' "approved,${DOCTOR},true"
expect 409 "approve again" POST "/app/patients/${ASHA_FILE}/prescriptions/${RX}/approve"
expect_value "again: why" "${REASON}" transition_not_allowed
expect 409 "change an approved one" PATCH "/app/patients/${ASHA_FILE}/prescriptions/${RX}" '{"advice":"x"}'
expect_value "approved: why" "${REASON}" prescription_approved
as_role owner
expect 409 "delete an approved one (P15)" DELETE "/app/patients/${ASHA_FILE}/prescriptions/${RX}?${DELETE_REASON}"
expect_value "delete approved: why" "${REASON}" prescription_approved
expect 204 "delete a draft" DELETE "/app/patients/${ASHA_FILE}/prescriptions/${EMPTY_RX}?${DELETE_REASON}"
expect 200 "restore it" POST "/app/patients/${ASHA_FILE}/prescriptions/${EMPTY_RX}/restore"
expect 200 "the pharmacy queue" GET "/app/patient-prescriptions?status=approved&patient_id=${ASHA_FILE}"
expect_value "queue: the approved one" '[.data[].id] | join(",")' "${RX}"
expect 200 "q: RX-number" GET "/app/patient-prescriptions?q=RX-${RX_NUMBER}"
expect_value "RX-number: it" '[.data[].id] | join(",")' "${RX}"
expect 400 "q: not a number" GET "/app/patient-prescriptions?q=tretinoin"
expect_value "q: field" "${FIELDS}" q
expect 200 "the nested list: the path wins (TR3)" GET "/app/patients/${ASHA_FILE}/prescriptions?patient_id=${BINA_FILE}"
expect_value "path wins: Asha's two" '.data | length' 2
expect 200 "date range (inclusive)" GET "/app/patients/${ASHA_FILE}/prescriptions?prescription_date_from=${TODAY}&prescription_date_to=${TODAY}&sort=prescription_date"
expect_value "today's: two" '.data | length' 2
expect 404 "under another patient" GET "/app/patients/${BINA_FILE}/prescriptions/${RX}"
expect 200 "the contact's activity" GET "/app/contacts/${ASHA}/activities?type=system"
expect_value "the approval's entry (M10)" "[.data[] | select(.patient_prescription_id == \"${RX}\")] | length" 1
as_role pharmacist
expect 200 "the pharmacist reads the queue" GET "/app/patient-prescriptions?status=approved"
expect 403 "the pharmacist writes none" POST "/app/patients/${ASHA_FILE}/prescriptions" "{\"doctor_membership_id\":\"${DOCTOR}\",\"prescription_date\":\"${TODAY}\"}"
as_role front_desk
expect 403 "the front desk reads no prescriptions" GET "/app/patients/${ASHA_FILE}/prescriptions"
as_role owner

# ---- 7.D Prescription kits (routes 21–26, P17) -------------------------------------------------
as_role doctor
expect 200 "the doctor saves a kit" POST /app/prescription-kits "$(jq -nc --arg name "Acne ${T}" --argjson line "${LINE}" '{name: $name, items: [$line]}')"
KIT="$(last '.data.id')"
expect_value "kit: rxk_, the doctor's" '[(.data.id | startswith("rxk_")), .data.owner_membership_id] | map(tostring) | join(",")' "true,${DOCTOR}"
expect 409 "the same name in another case" POST /app/prescription-kits "$(jq -nc --arg name "ACNE ${T}" '{name: $name, items: []}')"
expect 400 "a kit line of no live medicine" POST /app/prescription-kits "$(jq -nc --arg name "Ghost ${T}" --arg medicine "${NOWHERE_MEDICINE}" '{name: $name, items: [{medicine_name: "Ghost", medicine_id: $medicine}]}')"
expect 200 "my kits" GET "/app/prescription-kits?q=${T}"
expect_value "mine: one" '[.data[].id] | join(",")' "${KIT}"
UPDATED_AT="$(last '.data[0].updated_at')"
expect 200 "rename it" PATCH "/app/prescription-kits/${KIT}" "{\"name\":\"Acne starter ${T}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 409 "a stale change" PATCH "/app/prescription-kits/${KIT}" "{\"name\":\"x ${T}\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
as_role owner
expect 200 "the owner's kits" GET "/app/prescription-kits?q=${T}"
expect_value "another member's kit never shows" '.data | length' 0
expect 404 "another member's kit by id" GET "/app/prescription-kits/${KIT}"
expect 200 "the owner's own kit, same name" POST /app/prescription-kits "$(jq -nc --arg name "Acne starter ${T}" '{name: $name, items: []}')"
as_role doctor
expect 204 "delete the kit" DELETE "/app/prescription-kits/${KIT}?${DELETE_REASON}"
expect 200 "the name reused" POST /app/prescription-kits "$(jq -nc --arg name "Acne starter ${T}" '{name: $name, items: []}')"
expect 409 "restore over the reused name" POST "/app/prescription-kits/${KIT}/restore"
expect_value "reused: why" "${REASON}" record_restore_conflict
as_role front_desk
expect 403 "the front desk has no kits" GET /app/prescription-kits
as_role owner

# ---- 7.F Photos (routes 33–38, P19, P23–P26) ---------------------------------------------------
JPG="$(confirmed_upload cheek.jpg image/jpeg 1048576)"
PNG="$(confirmed_upload back.png image/png 2048)"
PRIVATE_JPG="$(confirmed_upload private.jpg image/jpeg 4096)"
PDF="$(confirmed_upload lab.pdf application/pdf 4096)"
BIG="$(confirmed_upload huge.jpg image/jpeg 16777216)"
expect 200 "a photo of Chetan's visit" POST "/app/patients/${CHETAN_FILE}/images" \
  "$(jq -nc --arg key "${JPG}" --arg visit "${CHETAN_VISIT}" '{file_key: $key, appointment_id: $visit, stage: "before", body_part: "upper_lip", display_name: "Lip"}')"
PHOTO="$(last '.data.id')"
expect_value "photo: general, today, the upload's name, the visit's label" '[.data.album, .data.taken_on, .data.file_name, .data.service_label] | join(",")' "general,${TODAY},cheek.jpg,Consultation"
expect 409 "the same upload again (P25)" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${JPG}" '{file_key: $key}')"
expect_value "again: why" "${REASON}" image_exists
expect 400 "a PDF" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${PDF}" '{file_key: $key}')"
expect_value "PDF: field" "${FIELDS}" file_key
expect 400 "over 15 MB" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${BIG}" '{file_key: $key}')"
expect 400 "an unconfirmed upload (P19)" POST "/app/patients/${CHETAN_FILE}/images" '{"file_key":"organizations/none/uploads/nothing.jpg"}'
expect 400 "taken in the future" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${PNG}" --arg day "${TOMORROW}" '{file_key: $key, taken_on: $day}')"
expect_value "future: field" "${FIELDS}" taken_on
expect 400 "another patient's visit" POST "/app/patients/${ASHA_FILE}/images" "$(jq -nc --arg key "${PNG}" --arg visit "${CHETAN_VISIT}" '{file_key: $key, appointment_id: $visit}')"
expect 400 "an unknown session" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${PNG}" --arg treatment "${NOWHERE_TREATMENT}" '{file_key: $key, patient_treatment_id: $treatment}')"
expect 400 "a body part off the list" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${PNG}" '{file_key: $key, body_part: "elbow"}')"
expect 200 "an LHR photo, not of a visit" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${PNG}" '{file_key: $key, album: "lhr", body_part: "full_body"}')"
LHR_PHOTO="$(last '.data.id')"
as_role therapist
expect 403 "a therapist files no private photo (P23)" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${PRIVATE_JPG}" '{file_key: $key, album: "private"}')"
expect_value "private: why" "${REASON}" field_permission_required
as_role doctor
expect 200 "the doctor files a private photo" POST "/app/patients/${CHETAN_FILE}/images" "$(jq -nc --arg key "${PRIVATE_JPG}" '{file_key: $key, album: "private"}')"
PRIVATE_PHOTO="$(last '.data.id')"
expect 200 "the doctor's tabs" GET "/app/patients/${CHETAN_FILE}/images"
expect_value "every album, with counts (P26)" '[(.data | length), .meta.album_counts.general, .meta.album_counts.lhr, .meta.album_counts.private] | map(tostring) | join(",")' 3,1,1,1
as_role therapist
expect 200 "the therapist's tabs" GET "/app/patients/${CHETAN_FILE}/images"
expect_value "no private photo, no private count" '[(.data | length), (.meta.album_counts | has("private"))] | map(tostring) | join(",")' 2,false
expect 404 "a private photo by id" GET "/app/patients/${CHETAN_FILE}/images/${PRIVATE_PHOTO}"
expect 200 "the therapist's activity" GET "/app/contacts/${CHETAN}/activities?type=system"
expect_value "the private photo's entry hidden (PC16)" "[.data[] | select(.patient_image_id == \"${PRIVATE_PHOTO}\")] | length" 0
expect_value "the general photo's entry shown" "[.data[] | select(.patient_image_id == \"${PHOTO}\")] | length" 1
expect 200 "album filter" GET "/app/patients/${CHETAN_FILE}/images?album=lhr"
expect_value "lhr: one" '[.data[].id] | join(",")' "${LHR_PHOTO}"
expect 200 "not attached to a visit" GET "/app/patients/${CHETAN_FILE}/images?has_appointment=false"
expect_value "no visit: the LHR one" '[.data[].id] | join(",")' "${LHR_PHOTO}"
expect 200 "a visit's photos" GET "/app/patients/${CHETAN_FILE}/images?appointment_id=${CHETAN_VISIT}"
expect_value "visit: the lip" '[.data[].id] | join(",")' "${PHOTO}"
expect 200 "stage and body part" GET "/app/patients/${CHETAN_FILE}/images?stage=before&body_part=upper_lip"
expect_value "before, upper lip: the lip" '[.data[].id] | join(",")' "${PHOTO}"
expect 200 "q: the name" GET "/app/patients/${CHETAN_FILE}/images?q=Lip"
expect_value "q: the lip" '[.data[].id] | join(",")' "${PHOTO}"
UPDATED_AT="$(api GET "/app/patients/${CHETAN_FILE}/images/${PHOTO}" >/dev/null; last '.data.updated_at')"
expect 200 "change its caption" PATCH "/app/patients/${CHETAN_FILE}/images/${PHOTO}" "{\"caption\":\"Before laser\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 409 "a stale change" PATCH "/app/patients/${CHETAN_FILE}/images/${PHOTO}" "{\"caption\":\"x\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 403 "move it to private (no album code)" PATCH "/app/patients/${CHETAN_FILE}/images/${PHOTO}" '{"album":"private"}'
expect 400 "the file key never changes" PATCH "/app/patients/${CHETAN_FILE}/images/${PHOTO}" "$(jq -nc --arg key "${PNG}" '{file_key: $key}')"
as_role doctor
expect 200 "the doctor moves it to private" PATCH "/app/patients/${CHETAN_FILE}/images/${PHOTO}" '{"album":"private"}'
as_role therapist
expect 404 "now a 404 to the therapist" GET "/app/patients/${CHETAN_FILE}/images/${PHOTO}"
expect 200 "the therapist's activity again" GET "/app/contacts/${CHETAN}/activities?type=system"
expect_value "its entry follows into private" "[.data[] | select(.patient_image_id == \"${PHOTO}\")] | length" 0
as_role front_desk
expect 403 "the front desk sees no photos (P14)" GET "/app/patients/${CHETAN_FILE}/images"
as_role owner
expect 204 "delete a photo" DELETE "/app/patients/${CHETAN_FILE}/images/${LHR_PHOTO}?reason=not_needed"
expect 200 "restore it" POST "/app/patients/${CHETAN_FILE}/images/${LHR_PHOTO}/restore"
expect 404 "under another patient" GET "/app/patients/${ASHA_FILE}/images/${LHR_PHOTO}"

# ---- 7.G Reports (routes 39–44, P29) ------------------------------------------------------------
REPORT_FILE="$(confirmed_upload cbc.pdf application/pdf 4096)"
expect 200 "a lab report" POST "/app/patients/${ASHA_FILE}/reports" \
  "$(jq -nc --arg key "${REPORT_FILE}" --arg day "${TODAY}" '{name: "CBC", report_date: $day, file_keys: [$key], notes: "Normal"}')"
REPORT="$(last '.data.id')"
expect_value "report: prep_, lab, one file" '[(.data.id | startswith("prep_")), .data.type, (.data.file_keys | length)] | map(tostring) | join(",")' true,lab,1
expect 400 "an unconfirmed file (P29)" POST "/app/patients/${ASHA_FILE}/reports" "{\"name\":\"X\",\"report_date\":\"${TODAY}\",\"file_keys\":[\"organizations/none/uploads/x.pdf\"]}"
expect_value "unconfirmed: field" "${FIELDS}" file_keys
expect 400 "eleven files" POST "/app/patients/${ASHA_FILE}/reports" "$(jq -nc --arg day "${TODAY}" '{name: "X", report_date: $day, file_keys: [range(0;11) | "k\(.)"]}')"
expect 200 "a scan" POST "/app/patients/${ASHA_FILE}/reports" "{\"name\":\"Ultrasound\",\"type\":\"scan\",\"report_date\":\"${TOMORROW}\"}"
SCAN="$(last '.data.id')"
expect 200 "the reports, newest first" GET "/app/patients/${ASHA_FILE}/reports"
expect_value "newest report date first" '[.data[].id] | join(",")' "${SCAN},${REPORT}"
expect 200 "type filter" GET "/app/patients/${ASHA_FILE}/reports?type=lab"
expect_value "lab: the CBC" '[.data[].id] | join(",")' "${REPORT}"
UPDATED_AT="$(api GET "/app/patients/${ASHA_FILE}/reports/${REPORT}" >/dev/null; last '.data.updated_at')"
expect 200 "change it" PATCH "/app/patients/${ASHA_FILE}/reports/${REPORT}" "{\"notes\":\"Low iron\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 409 "a stale change" PATCH "/app/patients/${ASHA_FILE}/reports/${REPORT}" "{\"notes\":\"x\",\"expected_updated_at\":\"${UPDATED_AT}\"}"
expect 400 "change to an unconfirmed file" PATCH "/app/patients/${ASHA_FILE}/reports/${REPORT}" '{"file_keys":["organizations/none/uploads/y.pdf"]}'
expect 204 "delete it" DELETE "/app/patients/${ASHA_FILE}/reports/${SCAN}?${DELETE_REASON}"
expect 200 "restore it" POST "/app/patients/${ASHA_FILE}/reports/${SCAN}/restore"
expect 404 "under another patient" GET "/app/patients/${BINA_FILE}/reports/${REPORT}"
expect 200 "the contact's activity" GET "/app/contacts/${ASHA}/activities?type=system"
expect_value "a system entry per report" "[.data[] | select(.patient_report_id != null)] | length" 2
as_role front_desk
expect 403 "the front desk reads no reports (P29)" GET "/app/patients/${ASHA_FILE}/reports"
expect 200 "the front desk's activity" GET "/app/contacts/${ASHA}/activities?type=system"
expect_value "report entries hidden from the front desk" "[.data[] | select(.patient_report_id != null)] | length" 0
as_role counsellor
expect 200 "a counsellor reads reports" GET "/app/patients/${ASHA_FILE}/reports"

# ---- Gates on the file itself (7.A.4) ----------------------------------------------------------
as_role marketing
expect 200 "marketing reads files" GET "/app/patients/${ASHA_FILE}"
expect 403 "marketing adds none" POST /app/patients "{\"contact_id\":\"${DEV}\",\"home_branch_id\":\"${VESU}\"}"
expect 403 "marketing exports none" GET /app/patients/exports
as_role therapist
expect 403 "a therapist exports none (P5)" GET /app/patients/exports
expect 403 "a therapist removes none" DELETE "/app/patients/${BINA_FILE}?${DELETE_REASON}"
as_role pharmacist
expect 200 "the pharmacist exports (P5)" GET "/app/patients/exports?q=${T}"
expect 403 "the pharmacist changes none" PATCH "/app/patients/${BINA_FILE}" '{"status":"new"}'
as_role front_desk
expect 200 "the front desk adds a file" POST /app/patients "{\"contact_id\":\"${DEV}\",\"home_branch_id\":\"${VESU}\"}"
as_role owner
