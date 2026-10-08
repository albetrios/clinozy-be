#!/usr/bin/env bash
# TEMPORARY — sub-domain 8, Billing 8.A–8.E (routes-final §8, launch ROUTE #136): invoices with the
# server's amounts, "Paid now", the patient offerings a line sells; credit notes and their refund;
# the ledger's kinds, splits, edits, delete and reverse; pending credits settled in parts; day
# closes, the day lock and the auto-close worker (WC-39). Sourced by run-live-api-checks.sh after
# live-api.sh; every name and number carries the run suffix, and the day closes run on a branch of
# their own, so the file replays on one fixture.
S="${LIVE_API_RUN:-$(date +%s)}"
T="v${S}"
# Ten-digit numbers unique to the run: 5 + the run's last 7 digits + two more.
N="5${S: -7}"
FIELDS='[.error.errors[].field] | join(",")'
REASON='.error.reason'
VESU="$(fixture '.branches.vesu')"
TODAY="$(calendar_day 0)"
YESTERDAY="$(calendar_day -1)"
THREE_DAYS_AGO="$(calendar_day -3)"
FOUR_DAYS_AGO="$(calendar_day -4)"
TOMORROW="$(calendar_day 1)"
LONG_AGO="$(calendar_day -121)"
IN_NINETY_DAYS="$(calendar_day 90)"
# The owner's membership (the fixture keeps the other members' ids only).
OWNER="$(compose_sql <<<"SELECT m.public_id FROM tenancy.memberships m JOIN auth.users u ON u.id = m.user_id JOIN tenancy.organizations o ON o.id = m.organization_id WHERE o.public_id = '$(fixture '.organization_id')' AND u.email = '$(fixture '.members.owner.email')' AND m.deleted_at IS NULL;")"

# person FIRST SUFFIX — a contact of this run with its own number; sets LAST_CONTACT.
person() {
  expect 200 "contact $1" POST /app/contacts "$(jq -nc --arg first "$1" --arg last "${T}" --arg phone "+91${N}$2" \
    '{first_name: $first, last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
  LAST_CONTACT="$(last '.data.id')"
}

# payment KIND BRANCH SPLITS [EXTRA_JSON] — a POST /app/payments body.
payment() {
  local extra="${4:-}"
  [ -n "${extra}" ] || extra='{}'
  jq -nc --arg kind "$1" --arg branch "$2" --argjson splits "$3" --argjson extra "${extra}" \
    '{kind: $kind, branch_id: $branch, splits: $splits} + $extra'
}

# at DAY — 10:00 on DAY in the fixture's time zone (India).
at() { printf '%sT10:00:00+05:30' "$1"; }

as_role owner
person Asha 21
ASHA="${LAST_CONTACT}"
person Bina 22
BINA="${LAST_CONTACT}"
person Ravi 23
RAVI="${LAST_CONTACT}"
expect 200 "Asha's file" POST /app/patients "{\"contact_id\":\"${ASHA}\",\"home_branch_id\":\"${VESU}\"}"
ASHA_FILE="$(last '.data.id')"
expect 200 "Bina's file" POST /app/patients "{\"contact_id\":\"${BINA}\",\"home_branch_id\":\"${VESU}\"}"
BINA_FILE="$(last '.data.id')"
expect 200 "a branch of this run (the day closes)" POST /app/branches \
  "$(jq -nc --arg name "Billing ${S}" --arg email "billing.${S}@fixture.example" \
    '{name: $name, address_line_one: "12 Ring Road", area: "Athwa", city: "Surat", postal_code: "395007", phone: "+919876543210", email: $email}')"
BB="$(last '.data.id')"
expect 200 "offering Facial" POST /app/offerings "{\"name\":\"Billing facial ${S}\",\"category\":\"treatment\",\"price\":1000,\"min_price\":800,\"gst_percent\":18,\"is_gst_inclusive\":false}"
FACIAL="$(last '.data.id')"
expect 200 "offering Glow pack" POST /app/offerings "{\"name\":\"Billing glow pack ${S}\",\"category\":\"package\",\"price\":6000,\"sessions\":6,\"validity_days\":90,\"gst_percent\":18,\"is_gst_inclusive\":true}"
PACK="$(last '.data.id')"
expect 200 "offering Consult" POST /app/offerings "{\"name\":\"Billing consult ${S}\",\"category\":\"consultation\",\"price\":500}"
CONSULT="$(last '.data.id')"
expect 200 "offering Adajan peel" POST /app/offerings \
  "$(jq -nc --arg name "Billing Adajan peel ${S}" --arg branch "$(fixture '.branches.adajan')" '{name: $name, category: "treatment", price: 700, branch_ids: [$branch]}')"
ADAJAN_ONLY="$(last '.data.id')"

# ==== 8.A Invoices (routes 1–7) ===================================================================
expect 200 "bill Asha a facial" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg offering "${FACIAL}" '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 1}]}')"
INV_A="$(last '.data.id')"
INV_A_LINE="$(last '.data.items[0].id')"
INV_A_NUMBER="$(last '.data.invoice_number')"
expect_value "amounts from the server (B9)" '[.data.subtotal, .data.taxable_total, .data.gst_total, .data.total, .data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")' "1000,1000,180,1180,0,1180,unpaid"
expect_value "the billed contact and file (B3)" '[.data.contact.id, .data.patient_id, .data.type, (.data.financial_year | test("^[0-9]{4}-[0-9]{2}$")), (.data.invoice_number | length > 0)] | map(tostring) | join(",")' "${ASHA},${ASHA_FILE},clinic,true,true"
expect_value "the line: rate, GST, the patient offering it sold (PK4)" '[(.data.items[0].id | startswith("iitm_")), .data.items[0].rate, .data.items[0].gst_percent, .data.items[0].amount, (.data.items[0].patient_offering_id != null)] | map(tostring) | join(",")' "true,1000,18,1180,true"
expect 200 "bill Bina two with discounts and Paid now (B13)" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${BINA}" --arg offering "${FACIAL}" \
    '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 2, discount_percent: 10}], overall_discount: 100, payment: {splits: [{mode: "cash", amount: 500}]}}')"
INV_B="$(last '.data.id')"
expect_value "discounts, GST, paid and due" '[.data.subtotal, .data.discount_total, .data.taxable_total, .data.gst_total, .data.total, .data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")' "2000,300,1700,306,2006,500,1506,partial"
expect 200 "bill Asha a package (inclusive GST)" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg offering "${PACK}" '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 1}]}')"
INV_P="$(last '.data.id')"
expect_value "inclusive: the price exactly" '[.data.taxable_total, .data.gst_total, .data.total] | map(tostring) | join(",")' "5084.75,915.25,6000"
expect 200 "what Asha bought" GET "/app/patients/${ASHA_FILE}/offerings?offering_id=${PACK}"
expect_value "the package: six sessions, 90 days, its bill and line (PK4)" "[.data[0].sessions_total, .data[0].valid_until, .data[0].invoice_id, (.data[0].invoice_item_id | startswith(\"iitm_\"))] | map(tostring) | join(\",\")" "6,${IN_NINETY_DAYS},${INV_P},true"
expect 200 "a consultation bill" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${BINA}" --arg offering "${CONSULT}" '{branch_id: $branch, contact_id: $contact, type: "consultation", items: [{offering_id: $offering, quantity: 1}]}')"
INV_C="$(last '.data.id')"
expect_value "consultation: no GST" '[.data.type, .data.gst_total, .data.total] | map(tostring) | join(",")' "consultation,0,500"
expect 400 "a clinic bill needs a contact" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg offering "${FACIAL}" '{branch_id: $branch, items: [{offering_id: $offering, quantity: 1}]}')"
expect_value "no contact: field" "${FIELDS}" contact_id
expect 400 "a contact with no patient file (B3)" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${RAVI}" --arg offering "${FACIAL}" '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 1}]}')"
expect_value "no file: why" "${REASON}" patient_file_required
expect 400 "an offering not at this branch" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg offering "${ADAJAN_ONLY}" '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 1}]}')"
expect_value "not here: field" "${FIELDS}" items
expect 400 "a consultation bill takes consultations only" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg offering "${FACIAL}" '{branch_id: $branch, contact_id: $contact, type: "consultation", items: [{offering_id: $offering, quantity: 1}]}')"
expect 400 "a medical bill takes medicines only" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg offering "${FACIAL}" '{branch_id: $branch, type: "medical", items: [{offering_id: $offering, quantity: 1}]}')"
expect 400 "below the lowest price (B10)" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg offering "${FACIAL}" '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 1, discount_percent: 30}]}')"
expect_value "below: why" "${REASON}" below_lowest_price
expect 400 "an overall discount over the lines" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg offering "${FACIAL}" '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 1}], overall_discount: 5000}')"
expect_value "overall discount: field" "${FIELDS}" overall_discount
expect 409 "Paid now over the total" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg offering "${FACIAL}" '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 1}], payment: {splits: [{mode: "upi", amount: 2000}]}}')"
expect_value "over the total: why" "${REASON}" more_than_due
expect 400 "an empty bill" POST /app/invoices "{\"branch_id\":\"${VESU}\",\"contact_id\":\"${ASHA}\",\"items\":[]}"
expect_value "empty: field" "${FIELDS}" body.items

expect 200 "Asha's bills" GET "/app/invoices?contact_id=${ASHA}"
expect_value "two, newest first" '[.data[].id] | join(",")' "${INV_P},${INV_A}"
expect 200 "by the number" GET "/app/invoices?q=${INV_A_NUMBER}"
expect_value "the number finds it" "[.data[].id | select(. == \"${INV_A}\")] | length" 1
expect 200 "Bina's file's bills (patient_id)" GET "/app/invoices?patient_id=${BINA_FILE}"
expect_value "Bina: the Paid-now bill and the consultation" '[.data[].id] | join(",")' "${INV_C},${INV_B}"
expect 200 "partly paid" GET "/app/invoices?contact_id=${BINA}&payment_status=partial"
expect_value "partial: the Paid-now bill" '[.data[].id] | join(",")' "${INV_B}"
expect 200 "by due, highest first" GET "/app/invoices?contact_id=${ASHA}&sort=due_amount&order=desc"
expect_value "the package first" '.data[0].id' "${INV_P}"
expect 200 "the invoices CSV" GET "/app/invoices/exports?contact_id=${ASHA}"
expect_value "CSV: name, rows" '[(.data.file_name | startswith("invoices-")), .data.row_count] | map(tostring) | join(",")' "true,2"
expect 200 "the print preview" GET "/app/invoices/${INV_B}"
expect_value "preview: one line, not settled" '[(.data.items | length), .data.is_settled] | map(tostring) | join(",")' "1,false"

expect 200 "change the remark" PATCH "/app/invoices/${INV_A}" '{"remark":"Window seat"}'
expect 200 "two facials on the line (B12)" PATCH "/app/invoices/${INV_A}" "{\"items\":[{\"id\":\"${INV_A_LINE}\",\"quantity\":2}]}"
expect_value "recomputed, the line kept" '[.data.total, .data.items[0].id, .data.items[0].quantity] | map(tostring) | join(",")' "2360,${INV_A_LINE},2"
expect 400 "a paid bill keeps its contact" PATCH "/app/invoices/${INV_B}" "{\"contact_id\":\"${ASHA}\"}"
expect_value "contact fixed: field" "${FIELDS}" contact_id
expect 400 "the date stays in its financial year (B11)" PATCH "/app/invoices/${INV_A}" '{"invoice_date":"2026-03-31"}'
expect_value "year: field" "${FIELDS}" invoice_date
expect 200 "a consultation paid in full" POST /app/invoices \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${BINA}" --arg offering "${CONSULT}" '{branch_id: $branch, contact_id: $contact, type: "consultation", items: [{offering_id: $offering, quantity: 1}], payment: {splits: [{mode: "upi", amount: 500}]}}')"
INV_D="$(last '.data.id')"
expect_value "paid" '[.data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")' "500,0,paid"
expect 409 "the total under what is paid" PATCH "/app/invoices/${INV_D}" '{"overall_discount":100}'
expect_value "below paid: why" "${REASON}" below_paid
expect 400 "the branch never changes" PATCH "/app/invoices/${INV_A}" "{\"branch_id\":\"${VESU}\"}"
expect 409 "a paid bill is never deleted (B14)" DELETE "/app/invoices/${INV_B}?reason=mistake"
expect_value "paid: why" "${REASON}" invoice_paid
expect 204 "delete the unpaid consultation" DELETE "/app/invoices/${INV_C}?reason=duplicate"
expect 404 "gone" GET "/app/invoices/${INV_C}"
expect 200 "restore it" POST "/app/invoices/${INV_C}/restore"
expect 409 "restore a live bill" POST "/app/invoices/${INV_C}/restore"
expect_value "live: why" "${REASON}" record_not_deleted
expect 204 "delete the package bill" DELETE "/app/invoices/${INV_P}?reason=mistake"
expect 200 "its patient offering goes with it" GET "/app/patients/${ASHA_FILE}/offerings?offering_id=${PACK}"
expect_value "none left" '.data | length' 0
expect 200 "and comes back" POST "/app/invoices/${INV_P}/restore"
expect 200 "the package again" GET "/app/patients/${ASHA_FILE}/offerings?offering_id=${PACK}"
expect_value "one" '.data | length' 1
as_role front_desk
expect 403 "the front desk deletes no bill (payment:delete)" DELETE "/app/invoices/${INV_A}?reason=mistake"
expect 200 "the front desk bills" GET "/app/invoices/${INV_A}"
as_role counsellor
expect 403 "the counsellor exports nothing (payment:export)" GET /app/invoices/exports
as_role doctor
expect 403 "the doctor reads no bills (payment:read)" GET /app/invoices
as_role owner

# ==== 8.C Payments (routes 12–20) =================================================================
expect 200 "receive 300 on Asha's bill" POST /app/payments \
  "$(payment receipt "${VESU}" '[{"mode":"cash","amount":300}]' "$(jq -nc --arg contact "${ASHA}" --arg invoice "${INV_A}" '{contact_id: $contact, invoice_id: $invoice}')")"
PAY_1="$(last '.data.id')"
expect_value "a receipt: received, splits, the contact (B17, B18)" '[(.data.id | startswith("pay_")), .data.direction, .data.amount, (.data.splits | map("\(.mode):\(.amount)") | join("+")), .data.contact.id, .data.is_settled, .data.edit_count] | map(tostring) | join(",")' "true,received,300,cash:300,${ASHA},false,0"
expect 200 "the bill's paid amount moved" GET "/app/invoices/${INV_A}"
expect_value "paid 300 of 2360" '[.data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")' "300,2060,partial"
expect 400 "a receipt needs its contact" POST /app/payments "$(payment receipt "${VESU}" '[{"mode":"cash","amount":10}]')"
expect_value "no contact: field" "${FIELDS}" contact_id
expect 400 "a receipt from the bill's contact (B19)" POST /app/payments \
  "$(payment receipt "${VESU}" '[{"mode":"cash","amount":10}]' "$(jq -nc --arg contact "${BINA}" --arg invoice "${INV_A}" '{contact_id: $contact, invoice_id: $invoice}')")"
expect_value "other contact: field" "${FIELDS}" contact_id
expect 409 "more than the due" POST /app/payments \
  "$(payment receipt "${VESU}" '[{"mode":"card","amount":5000}]' "$(jq -nc --arg contact "${ASHA}" --arg invoice "${INV_A}" '{contact_id: $contact, invoice_id: $invoice}')")"
expect_value "over the due: why" "${REASON}" more_than_due
expect 400 "an expense names who was paid" POST /app/payments "$(payment expense "${VESU}" '[{"mode":"upi","amount":250}]' '{"expense_category":"maintenance"}')"
expect_value "no payee: field" "${FIELDS}" payee_name
expect 400 "an expense has a category" POST /app/payments "$(payment expense "${VESU}" '[{"mode":"upi","amount":250}]' '{"payee_name":"Raj"}')"
expect_value "no category: field" "${FIELDS}" expense_category
expect 400 "only an expense has a category" POST /app/payments \
  "$(payment money_back "${VESU}" '[{"mode":"cash","amount":10}]' '{"expense_category":"rent"}')"
expect 400 "money back is against no bill" POST /app/payments \
  "$(payment money_back "${VESU}" '[{"mode":"cash","amount":10}]' "$(jq -nc --arg contact "${ASHA}" --arg invoice "${INV_A}" '{contact_id: $contact, invoice_id: $invoice}')")"
expect_value "money back: field" "${FIELDS}" invoice_id
expect 400 "a refund has its own route (B17)" POST /app/payments "$(payment refund "${VESU}" '[{"mode":"cash","amount":10}]')"
expect_value "refund: field" "${FIELDS}" body.kind
expect 400 "credit only through a pending credit" POST /app/payments "$(payment money_back "${VESU}" '[{"mode":"credit","amount":10}]')"
expect 400 "a mode once" POST /app/payments "$(payment money_back "${VESU}" '[{"mode":"cash","amount":10},{"mode":"cash","amount":5}]')"
expect 400 "nothing is not money" POST /app/payments "$(payment money_back "${VESU}" '[{"mode":"cash","amount":0}]')"
expect_value "zero: field" "${FIELDS}" body.splits/0/amount
expect 200 "pay an expense" POST /app/payments \
  "$(payment expense "${VESU}" '[{"mode":"upi","amount":250}]' "$(jq -nc --arg payee "Raj Electricals ${S}" '{payee_name: $payee, expense_category: "maintenance", reference: "UPI-1"}')")"
PAY_E="$(last '.data.id')"
expect_value "an expense: paid" '[.data.kind, .data.direction, .data.expense_category] | join(",")' "expense,paid,maintenance"

expect 200 "split the receipt and raise it (B20)" PATCH "/app/payments/${PAY_1}" '{"splits":[{"mode":"cash","amount":200},{"mode":"upi","amount":150}]}'
expect_value "350, two modes, one edit" '[.data.amount, (.data.splits | map(.mode) | join("+")), .data.edit_count, (.data.last_edit.id | startswith("pedit_"))] | map(tostring) | join(",")' "350,cash+upi,1,true"
expect 200 "the bill follows" GET "/app/invoices/${INV_A}"
expect_value "paid 350" '.data.paid_amount' 350
expect 200 "what changed" GET "/app/payments/${PAY_1}/edits"
expect_value "the splits, before → after, by the owner" '[(.data | length), (.data[0].changes.splits.from | map("\(.mode):\(.amount)") | join("+")), (.data[0].changes.splits.to | map("\(.mode):\(.amount)") | join("+")), .data[0].author_membership_id] | map(tostring) | join(",")' "1,cash:300,cash:200+upi:150,${OWNER}"
expect 200 "make it an advance" PATCH "/app/payments/${PAY_1}" '{"invoice_id":null}'
expect 200 "the bill drops it" GET "/app/invoices/${INV_A}"
expect_value "paid 0" '.data.paid_amount' 0
expect 200 "move the advance onto the bill (8.10)" PATCH "/app/payments/${PAY_1}" "{\"invoice_id\":\"${INV_A}\"}"
expect 200 "two changes recorded" GET "/app/payments/${PAY_1}/edits?limit=1"
expect_value "newest first, paged" '[(.data | length), .data[0].changes.invoice_id.to, .meta.pagination.has_more] | map(tostring) | join(",")' "1,${INV_A},true"
expect 400 "the kind never changes" PATCH "/app/payments/${PAY_1}" '{"kind":"money_back"}'
as_role front_desk
expect 403 "the front desk deletes no payment" DELETE "/app/payments/${PAY_E}?reason=mistake"
as_role owner
expect 204 "delete the expense (open day)" DELETE "/app/payments/${PAY_E}?reason=mistake"
expect 200 "restore it" POST "/app/payments/${PAY_E}/restore"
expect 200 "Asha's receipts" GET "/app/payments?contact_id=${ASHA}&kind=receipt"
expect_value "the receipt" "[.data[].id | select(. == \"${PAY_1}\")] | length" 1
expect 200 "has a UPI split, today, not settled" GET "/app/payments?mode=upi&paid_date_from=${TODAY}&paid_date_to=${TODAY}&is_settled=false&contact_id=${ASHA}"
expect_value "the split receipt" '[.data[].id] | join(",")' "${PAY_1}"
expect 200 "by payee" GET "/app/payments?q=Raj%20Electricals%20${S}"
expect_value "the expense" '[.data[].id] | join(",")' "${PAY_E}"
expect 200 "Asha's file's payments (patient_id)" GET "/app/payments?patient_id=${ASHA_FILE}"
expect_value "Asha's" "[.data[] | select(.contact.id != \"${ASHA}\")] | length" 0
expect 200 "the payments CSV" GET "/app/payments/exports?contact_id=${ASHA}"
expect_value "CSV name" '.data.file_name | startswith("payments-")' true
as_role counsellor
expect 403 "the counsellor exports no payments" GET /app/payments/exports
expect 403 "the counsellor changes no payment (payment:update)" PATCH "/app/payments/${PAY_1}" '{"note":"x"}'
as_role owner

# ==== 8.B Credit notes (routes 8–11) ==============================================================
expect 200 "refund Bina 200 (B16)" POST "/app/invoices/${INV_B}/credit-notes" '{"amount":200,"reason":"Unhappy with the result","splits":[{"mode":"cash","amount":200}]}'
CN_1="$(last '.data.id')"
CN_1_PAYMENT="$(last '.data.payment_id')"
expect_value "a credit note with its refund" '[(.data.id | startswith("cn_")), (.data.credit_note_number > 0), .data.invoice_id, .data.amount, (.data.payment_id | startswith("pay_"))] | map(tostring) | join(",")' "true,true,${INV_B},200,true"
expect 200 "the bill's paid amount fell" GET "/app/invoices/${INV_B}"
expect_value "paid 300" '.data.paid_amount' 300
expect 200 "the refund payment" GET "/app/payments/${CN_1_PAYMENT}"
expect_value "refund: paid, the credit note, the contact" '[.data.kind, .data.direction, .data.invoice_credit_note_id, .data.contact.id] | join(",")' "refund,paid,${CN_1},${BINA}"
expect 409 "more than is paid" POST "/app/invoices/${INV_B}/credit-notes" '{"amount":1000,"reason":"Too much","splits":[{"mode":"cash","amount":1000}]}'
expect_value "more than paid: why" "${REASON}" more_than_paid
expect 400 "splits that don't add up" POST "/app/invoices/${INV_B}/credit-notes" '{"amount":100,"reason":"x","splits":[{"mode":"cash","amount":50}]}'
expect_value "splits: field" "${FIELDS}" body.splits
expect 400 "no refund in credit" POST "/app/invoices/${INV_B}/credit-notes" '{"amount":100,"reason":"x","splits":[{"mode":"credit","amount":100}]}'
expect 200 "the bill's credit notes" GET "/app/invoices/${INV_B}/credit-notes"
expect_value "one" '[.data[].id] | join(",")' "${CN_1}"
expect 200 "one credit note" GET "/app/invoices/${INV_B}/credit-notes/${CN_1}"
expect 404 "under another bill" GET "/app/invoices/${INV_A}/credit-notes/${CN_1}"
expect 200 "every credit note, by bill" GET "/app/invoice-credit-notes?invoice_id=${INV_B}"
expect_value "by bill: one" '.data | length' 1
expect 200 "by the bill's contact" GET "/app/invoice-credit-notes?contact_id=${BINA}"
expect_value "Bina's" "[.data[].id | select(. == \"${CN_1}\")] | length" 1
expect 400 "a refund's amount is fixed" PATCH "/app/payments/${CN_1_PAYMENT}" '{"splits":[{"mode":"cash","amount":150}]}'
expect_value "fixed: field" "${FIELDS}" splits
expect 200 "its mode may move" PATCH "/app/payments/${CN_1_PAYMENT}" '{"splits":[{"mode":"upi","amount":200}]}'
expect 400 "a refund keeps its contact" PATCH "/app/payments/${CN_1_PAYMENT}" "{\"contact_id\":\"${ASHA}\"}"
expect_value "link fixed: field" "${FIELDS}" contact_id
expect 204 "delete the refund (open day)" DELETE "/app/payments/${CN_1_PAYMENT}?reason=mistake"
expect 404 "its credit note goes too (B16)" GET "/app/invoices/${INV_B}/credit-notes/${CN_1}"
expect 200 "the money is back on the bill" GET "/app/invoices/${INV_B}"
expect_value "paid 500" '.data.paid_amount' 500
expect 200 "restore the refund" POST "/app/payments/${CN_1_PAYMENT}/restore"
expect 200 "its credit note is back" GET "/app/invoices/${INV_B}/credit-notes/${CN_1}"
expect 200 "bill Asha at the run's branch, paid now" POST /app/invoices \
  "$(jq -nc --arg branch "${BB}" --arg contact "${ASHA}" --arg offering "${FACIAL}" '{branch_id: $branch, contact_id: $contact, items: [{offering_id: $offering, quantity: 1}], payment: {splits: [{mode: "cash", amount: 100}]}}')"
INV_BB="$(last '.data.id')"
expect 200 "refund there" POST "/app/invoices/${INV_BB}/credit-notes" '{"amount":50,"reason":"Part refund","splits":[{"mode":"cash","amount":50}]}'
CN_BB="$(last '.data.id')"
as_role front_desk
expect 404 "another branch's bill: no credit notes (B4)" GET "/app/invoices/${INV_BB}/credit-notes"
expect 404 "nor one of them" GET "/app/invoices/${INV_BB}/credit-notes/${CN_BB}"
expect 404 "nor a refund on it" POST "/app/invoices/${INV_BB}/credit-notes" '{"amount":10,"reason":"x","splits":[{"mode":"cash","amount":10}]}'
expect 200 "every credit note — the caller's branches" GET "/app/invoice-credit-notes?invoice_id=${INV_BB}"
expect_value "the other branch's hidden" '.data | length' 0
expect 404 "another branch's payment (B4)" GET "/app/payments/$(compose_sql <<<"SELECT p.public_id FROM app.payments p JOIN app.invoices i ON i.id = p.invoice_id WHERE i.public_id = '${INV_BB}' AND p.kind = 'receipt';")"
as_role owner

# ==== 8.D Pending credits (routes 21–27) ==========================================================
expect 200 "owe Asha 500, for her bill (B23)" POST /app/pending-credits \
  "$(jq -nc --arg contact "${ASHA}" --arg invoice "${INV_A}" '{direction: "give", amount: 500, reason: "Advance to return", contact_id: $contact, invoice_id: $invoice, settle_by: "'"${TOMORROW}"'"}')"
PC_A="$(last '.data.id')"
PC_A_NUMBER="$(last '.data.pending_credit_number')"
expect_value "open, nothing settled" '[(.data.id | startswith("pcr_")), .data.status, .data.settled_amount, .data.left_amount, .data.contact.id, .data.patient_id] | map(tostring) | join(",")' "true,open,0,500,${ASHA},${ASHA_FILE}"
expect 400 "a contact or a name" POST /app/pending-credits '{"direction":"give","amount":10,"reason":"x"}'
expect_value "no party: field" "${FIELDS}" party_name
expect 400 "the bill is the contact's" POST /app/pending-credits \
  "$(jq -nc --arg contact "${BINA}" --arg invoice "${INV_A}" '{direction: "give", amount: 10, reason: "x", contact_id: $contact, invoice_id: $invoice}')"
expect_value "other contact's bill: field" "${FIELDS}" invoice_id
expect 200 "give back 200 in cash (B24)" POST "/app/pending-credits/${PC_A}/settle" "{\"amount\":200,\"method\":\"money\",\"branch_id\":\"${VESU}\",\"splits\":[{\"mode\":\"cash\",\"amount\":200}]}"
expect_value "200 settled, still open" '[.data.settled_amount, .data.left_amount, .data.status, (.data.payment_ids | length)] | map(tostring) | join(",")' "200,300,open,1"
expect 200 "the refund carries a credit note on the bill" GET "/app/invoices/${INV_A}/credit-notes"
expect_value "one credit note of 200" '[(.data | length), .data[0].amount] | map(tostring) | join(",")' "1,200"
expect 400 "more than is left" POST "/app/pending-credits/${PC_A}/settle" "{\"amount\":400,\"method\":\"money\",\"branch_id\":\"${VESU}\",\"splits\":[{\"mode\":\"cash\",\"amount\":400}]}"
expect_value "left: field" "${FIELDS}" amount
expect 400 "money needs a branch and splits" POST "/app/pending-credits/${PC_A}/settle" '{"amount":10,"method":"money"}'
expect_value "money: fields" "${FIELDS}" body.branch_id,body.splits
expect 409 "change it once settled" PATCH "/app/pending-credits/${PC_A}" '{"note":"x"}'
expect_value "settled: why" "${REASON}" credit_settled
expect 409 "delete it once settled" DELETE "/app/pending-credits/${PC_A}?reason=mistake"
expect 200 "use the rest on her bill" POST "/app/pending-credits/${PC_A}/settle" "{\"amount\":300,\"method\":\"use_on_bill\",\"invoice_id\":\"${INV_A}\"}"
expect_value "used up" '[.data.settled_amount, .data.left_amount, .data.status, (.data.payment_ids | length)] | map(tostring) | join(",")' "500,0,used,2"
expect 200 "the bill took the credit" GET "/app/payments?invoice_id=${INV_A}&mode=credit"
expect_value "a receipt paid by credit" '[(.data | length), .data[0].kind, (.data[0].splits | map(.mode) | join("+"))] | map(tostring) | join(",")' "1,receipt,credit"
expect 409 "settled in full" POST "/app/pending-credits/${PC_A}/settle" "{\"amount\":1,\"method\":\"use_on_bill\",\"invoice_id\":\"${INV_A}\"}"
expect_value "closed: why" "${REASON}" credit_closed
expect 200 "a supplier owes the clinic 400" POST /app/pending-credits "{\"direction\":\"take\",\"amount\":400,\"reason\":\"Returned stock\",\"party_name\":\"Supplier ${S}\"}"
PC_T="$(last '.data.id')"
expect 400 "a take is never used on a bill" POST "/app/pending-credits/${PC_T}/settle" "{\"amount\":100,\"method\":\"use_on_bill\",\"invoice_id\":\"${INV_A}\"}"
expect_value "take: field" "${FIELDS}" method
expect 200 "get it back in cash" POST "/app/pending-credits/${PC_T}/settle" "{\"amount\":400,\"method\":\"money\",\"branch_id\":\"${VESU}\",\"splits\":[{\"mode\":\"cash\",\"amount\":400}]}"
expect_value "got back" '.data.status' got_back
expect 200 "its settlement is money back" GET "/app/payments?pending_credit_id=${PC_T}"
expect_value "money back, received" '[.data[0].kind, .data[0].direction] | join(",")' "money_back,received"
expect 200 "owe Bina 300, by tomorrow" POST /app/pending-credits "{\"direction\":\"give\",\"amount\":300,\"reason\":\"Goodwill\",\"contact_id\":\"${BINA}\",\"settle_by\":\"${TOMORROW}\"}"
PC_B="$(last '.data.id')"
expect 409 "not her bill (nothing due for her)" POST "/app/pending-credits/${PC_B}/settle" "{\"amount\":100,\"method\":\"use_on_bill\",\"invoice_id\":\"${INV_A}\"}"
expect_value "not hers: why" "${REASON}" nothing_due
expect 200 "change it while unsettled" PATCH "/app/pending-credits/${PC_B}" '{"amount":350}'
expect 204 "delete it while unsettled" DELETE "/app/pending-credits/${PC_B}?reason=not_needed"
expect 200 "restore it" POST "/app/pending-credits/${PC_B}/restore"
expect 200 "by the number" GET "/app/pending-credits?q=CR-${PC_A_NUMBER}"
expect_value "the number finds it" "[.data[].id | select(. == \"${PC_A}\")] | length" 1
expect 200 "used or got back, by contact" GET "/app/pending-credits?status=used,got_back&contact_id=${ASHA}"
expect_value "Asha's used one" '[.data[].id] | join(",")' "${PC_A}"
expect 200 "open, settle by tomorrow" GET "/app/pending-credits?direction=give&status=open&contact_id=${BINA}&sort=settle_by"
expect_value "Bina's open one" '[.data[].id] | join(",")' "${PC_B}"
as_role counsellor
expect 200 "the counsellor reads one (payment:read)" GET "/app/pending-credits/${PC_B}"
expect 403 "the counsellor deletes none" DELETE "/app/pending-credits/${PC_B}?reason=mistake"
as_role owner

# ==== 8.E Day closes (routes 28–32) — on the run's branch ========================================
expect 200 "yesterday's receipt there" POST /app/payments \
  "$(payment receipt "${BB}" '[{"mode":"cash","amount":400}]' "$(jq -nc --arg contact "${ASHA}" --arg at "$(at "${YESTERDAY}")" '{contact_id: $contact, paid_at: $at}')")"
PAY_Y="$(last '.data.id')"
expect 200 "and an expense" POST /app/payments \
  "$(payment expense "${BB}" '[{"mode":"cash","amount":100}]' "$(jq -nc --arg at "$(at "${YESTERDAY}")" '{payee_name: "Tea", expense_category: "misc", paid_at: $at}')")"
expect 200 "open yesterday (carried, B25)" POST /app/day-closes "{\"branch_id\":\"${BB}\",\"close_date\":\"${YESTERDAY}\"}"
DC_Y="$(last '.data.id')"
expect_value "open, carried 0, who accepted" '[(.data.id | startswith("dcl_")), .data.status, .data.opening_source, .data.opening_cash, .data.opening_accepted_by_membership_id, (.data.events | map(.kind) | join("+"))] | map(tostring) | join(",")' "true,open,carried,0,${OWNER},opened"
expect 409 "one per branch and day" POST /app/day-closes "{\"branch_id\":\"${BB}\",\"close_date\":\"${YESTERDAY}\"}"
expect_value "twice: why" "${REASON}" record_already_exists
expect 400 "never in the future" POST /app/day-closes "{\"branch_id\":\"${BB}\",\"close_date\":\"${TOMORROW}\"}"
expect_value "future: field" "${FIELDS}" close_date
expect 400 "never more than 120 days back" POST /app/day-closes "{\"branch_id\":\"${BB}\",\"close_date\":\"${LONG_AGO}\"}"
expect 400 "a recount needs its cash" POST /app/day-closes "{\"branch_id\":\"${BB}\",\"close_date\":\"${THREE_DAYS_AGO}\",\"opening_source\":\"recounted\"}"
expect_value "recount: field" "${FIELDS}" body.opening_cash
expect 400 "the carried cash is the server's" POST /app/day-closes "{\"branch_id\":\"${BB}\",\"close_date\":\"${THREE_DAYS_AGO}\",\"opening_cash\":5}"
expect 200 "the day's live figures (B27)" GET "/app/day-closes/${DC_Y}"
expect_value "in 400, out 100, expected 300" '[.data.cash_in, .data.cash_out, .data.expected_cash, .data.entry_count, .data.net_by_mode.cash, (.data.by_member | length), .data.by_member[0].membership_id] | map(tostring) | join(",")' "400,100,300,2,300,1,${OWNER}"
as_role counsellor
expect 403 "the counsellor closes no day (payment:update)" POST "/app/day-closes/${DC_Y}/close" '{"counted_cash":300}'
as_role owner
expect 400 "a short count needs a reason" POST "/app/day-closes/${DC_Y}/close" '{"counted_cash":250}'
expect_value "difference: field" "${FIELDS}" difference_reason
expect 200 "count and close" POST "/app/day-closes/${DC_Y}/close" '{"counted_cash":250,"difference_reason":"Short by 50"}'
expect_value "closed: expected, difference, manual, events" '[.data.status, .data.expected_cash, .data.counted_cash, .data.difference, .data.close_kind, .data.closed_by_membership_id, (.data.events | map(.kind) | join("+"))] | map(tostring) | join(",")' "closed,300,250,-50,manual,${OWNER},opened+closed"
expect 409 "close it twice" POST "/app/day-closes/${DC_Y}/close" '{"counted_cash":250}'
expect_value "twice: why" "${REASON}" transition_not_allowed
expect 409 "a closed day's payment never changes (B6)" PATCH "/app/payments/${PAY_Y}" '{"note":"late"}'
expect_value "closed day: why" "${REASON}" day_closed
expect 409 "nor is deleted" DELETE "/app/payments/${PAY_Y}?reason=mistake"
expect 409 "nothing is added to it" POST /app/payments \
  "$(payment money_back "${BB}" '[{"mode":"cash","amount":10}]' "$(jq -nc --arg at "$(at "${YESTERDAY}")" '{paid_at: $at}')")"
expect_value "added: why" "${REASON}" day_closed
expect 200 "it is settled" GET "/app/payments/${PAY_Y}"
expect_value "settled" '.data.is_settled' true
expect 409 "an open day's payment is deleted, not reversed" POST "/app/payments/${PAY_1}/reverse" '{"reason":"x"}'
expect_value "open: why" "${REASON}" day_open
expect 200 "reverse the settled receipt (B21)" POST "/app/payments/${PAY_Y}/reverse" '{"reason":"Wrong patient"}'
REVERSAL="$(last '.data.id')"
expect_value "a reversal: opposite, pointing at it, the reason" '[.data.kind, .data.direction, .data.amount, .data.reverses_payment_id, .data.note] | map(tostring) | join(",")' "reversal,paid,400,${PAY_Y},Wrong patient"
expect 200 "shown reversed" GET "/app/payments/${PAY_Y}"
expect_value "reversed by it" '.data.reversed_by_payment_id' "${REVERSAL}"
expect 409 "reverse it twice" POST "/app/payments/${PAY_Y}/reverse" '{"reason":"again"}'
expect_value "twice: why" "${REASON}" already_reversed
expect 409 "reverse a reversal" POST "/app/payments/${REVERSAL}/reverse" '{"reason":"again"}'
as_role front_desk
expect 403 "the front desk reverses nothing (payment:delete)" POST "/app/payments/${PAY_1}/reverse" '{"reason":"x"}'
expect 403 "nor reopens a day" POST "/app/day-closes/${DC_Y}/reopen" '{"reason":"x"}'
expect 200 "the front desk's days — its branches only (B4)" GET "/app/day-closes?branch_id=${BB}"
expect_value "the run's branch hidden" '.data | length' 0
expect 404 "another branch's day" GET "/app/day-closes/${DC_Y}"
as_role owner
expect 200 "reopen with a reason" POST "/app/day-closes/${DC_Y}/reopen" '{"reason":"Recount the drawer"}'
expect_value "open, the count cleared, reopened" '[.data.status, .data.counted_cash, .data.close_kind, (.data.events | map(.kind) | join("+")), .data.events[-1].text] | map(tostring) | join(",")' "open,null,null,opened+closed+reopened,Recount the drawer"
expect 409 "reopen an open day" POST "/app/day-closes/${DC_Y}/reopen" '{"reason":"x"}'
expect 400 "a reason to reopen" POST "/app/day-closes/${DC_Y}/reopen" '{}'
expect 200 "close again, the count right" POST "/app/day-closes/${DC_Y}/close" '{"counted_cash":300}'
expect_value "no difference, no reason" '[.data.difference, .data.difference_reason] | map(tostring) | join(",")' "0,null"
expect 200 "open today, carried from yesterday" POST /app/day-closes "{\"branch_id\":\"${BB}\"}"
expect_value "today, 300 carried" '[.data.close_date, .data.opening_cash, .data.opening_source] | map(tostring) | join(",")' "${TODAY},300,carried"
expect 200 "open three days ago, recounted" POST /app/day-closes "{\"branch_id\":\"${BB}\",\"close_date\":\"${THREE_DAYS_AGO}\",\"opening_source\":\"recounted\",\"opening_cash\":1000}"
DC_3="$(last '.data.id')"
expect_value "recounted: two events" '[.data.opening_source, .data.opening_cash, (.data.events | map(.kind) | join("+"))] | map(tostring) | join(",")' "recounted,1000,opened+recounted"
expect 200 "the days, newest first" GET "/app/day-closes?branch_id=${BB}"
expect_value "today, yesterday, three days ago" '[.data[].close_date] | join(",")' "${TODAY},${YESTERDAY},${THREE_DAYS_AGO}"
expect 200 "closed ones in a range" GET "/app/day-closes?branch_id=${BB}&status=closed&close_date_from=${YESTERDAY}&close_date_to=${YESTERDAY}"
expect_value "yesterday" '[.data[].id] | join(",")' "${DC_Y}"

# ---- WC-39: the auto-close worker (B26) ------------------------------------------------------------
expect 200 "money on a day nobody opened" POST /app/payments \
  "$(payment money_back "${BB}" '[{"mode":"cash","amount":200}]' "$(jq -nc --arg at "$(at "${FOUR_DAYS_AGO}")" '{paid_at: $at}')")"
npx tsx tooling/dev/live-api/trigger-day-close-sweep.ts >/dev/null 2>&1
for _ in $(seq 1 20); do
  api GET "/app/day-closes?branch_id=${BB}&close_date_from=${FOUR_DAYS_AGO}&close_date_to=${THREE_DAYS_AGO}" >/dev/null
  [ "$(last '[.data[] | select(.status == "closed")] | length')" = 2 ] && break
  sleep 1
done
expect 200 "the past days after the sweep" GET "/app/day-closes?branch_id=${BB}&close_date_from=${FOUR_DAYS_AGO}&close_date_to=${THREE_DAYS_AGO}"
expect_value "both closed by the worker, counted as expected" '[.data[] | "\(.close_date):\(.status):\(.close_kind):\(.opening_cash):\(.expected_cash):\(.counted_cash)"] | join(",")' "${THREE_DAYS_AGO}:closed:auto:1000:1000:1000,${FOUR_DAYS_AGO}:closed:auto:0:200:200"
expect 200 "the recounted day's story" GET "/app/day-closes/${DC_3}"
expect_value "opened, recounted, auto-closed" '.data.events | map(.kind) | join("+")' "opened+recounted+auto_closed"
expect 200 "today and yesterday untouched" GET "/app/day-closes?branch_id=${BB}&close_date_from=${YESTERDAY}"
expect_value "today still open" '[.data[] | "\(.close_date):\(.close_kind)"] | join(",")' "${TODAY}:null,${YESTERDAY}:manual"
