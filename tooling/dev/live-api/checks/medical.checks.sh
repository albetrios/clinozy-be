#!/usr/bin/env bash
# TEMPORARY — sub-domain 11, the medical store 11.A–11.H (routes-final §11, launch ROUTE #153):
# manufacturers and suppliers linked both ways; medicines with batches, supplier prices and the
# near-expiry discount; orders received into batches; supplier credits applied to what is owed and
# paying a supplier; MRs, their visits and the visit reminder task; sales through the invoice ledger
# by earliest expiry, their void and undo, returns with a credit note; the store's payments; the
# medicine codes by role. Sourced by run-live-api-checks.sh after live-api.sh; every name carries
# the run suffix, so the file replays on one fixture.
S="${LIVE_API_RUN:-$(date +%s)}"
T="m${S}"
# Ten-digit numbers unique to the run: 7 + the run's last 7 digits + two more.
N="7${S: -7}"
FIELDS='[.error.errors[].field] | join(",")'
REASON='.error.reason'
VESU="$(fixture '.branches.vesu')"
DOCTOR="$(fixture '.members.doctor.membership_id')"
ORGANIZATION="$(fixture '.organization_id')"
TODAY="$(calendar_day 0)"
TOMORROW="$(calendar_day 1)"
NEXT_MONTH="$(date -d "${TODAY:0:7}-01 +1 month" +%Y-%m)"
LATER="$(date -d "${TODAY:0:7}-01 +2 years" +%Y-%m)"
LATEST="$(date -d "${TODAY:0:7}-01 +3 years" +%Y-%m)"
DELETE_REASON='reason=mistake'

# stock_of MEDICINE — the medicine's quantity now.
stock_of() { api GET "/app/medicines/$1" >/dev/null; last '.data.quantity'; }

# batch_stock MEDICINE NUMBER — one batch's packs now (0 when it holds none).
batch_stock() {
  api GET "/app/medicines/$1" >/dev/null
  last "[.data.batches[] | select(.batch_number == \"$2\") | .quantity] | first // 0"
}

# run_task_rules — one run of the task rules for the fixture organization (as the sweep would).
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

as_role owner

# ==== 11.A Manufacturers (routes 1–6) =============================================================
expect 200 "add a manufacturer" POST /app/manufacturers "$(jq -nc --arg name "alvi ${T}" '{name: $name}')"
MFR="$(last '.data.id')"
expect_value "upper case, lav, no medicines (MD9)" '[(.data.id | startswith("mfr_")), .data.name, .data.tone, .data.is_quick, .data.medicine_count] | map(tostring) | join(",")' "true,ALVI ${T^^},lav,false,0"
expect 409 "the name in another case" POST /app/manufacturers "$(jq -nc --arg name "Alvi ${T}" '{name: $name}')"
expect_value "taken: why" "${REASON}" record_already_exists
expect 200 "a quick one from a picker" POST /app/manufacturers "$(jq -nc --arg name "Quickbrand ${T}" '{name: $name, is_quick: true}')"
QUICK_MFR="$(last '.data.id')"
expect_value "a quick one takes the next tone (after lav)" '[.data.is_quick, .data.tone] | map(tostring) | join(",")' "true,sky"
expect 400 "no name" POST /app/manufacturers '{}'
expect_value "no name: field" "${FIELDS}" body.name
expect 400 "a supplier not here" POST /app/manufacturers "$(jq -nc --arg name "Linked ${T}" '{name: $name, supplier_ids: ["sup_000000000000000000000"]}')"
expect_value "unknown supplier: field" "${FIELDS}" supplier_ids
expect 200 "the picker by name, A–Z" GET "/app/manufacturers?q=${T}"
expect_value "both, A–Z" '[.data[].id] | join(",")' "${MFR},${QUICK_MFR}"
expect 200 "change the tone" PATCH "/app/manufacturers/${QUICK_MFR}" '{"tone":"mint"}'
expect_value "mint" '.data.tone' mint
expect 404 "a manufacturer not here" GET /app/manufacturers/mfr_000000000000000000000

# ==== 11.B Suppliers (routes 7–12) ================================================================
expect 200 "add a supplier" POST /app/suppliers "$(jq -nc --arg name "Shree Agency ${T}" --arg phone "+91${N}11" --arg mfr "${MFR}" '{name: $name, phone: $phone, gst_number: "24ABCDE1234F1Z5", manufacturer_ids: [$mfr]}')"
SUP="$(last '.data.id')"
expect_value "the supplier: its brand, nothing owed, no orders (MD10)" '[(.data.id | startswith("sup_")), .data.manufacturers[0].id, .data.payable, (.data.ageing_days | tostring), .data.order_count] | map(tostring) | join(",")' "true,${MFR},0,null,0"
expect 200 "the manufacturer sees it (links both ways)" GET "/app/manufacturers/${MFR}"
expect_value "the manufacturer's suppliers" '[.data.suppliers[].id] | join(",")' "${SUP}"
expect 409 "the name in another case" POST /app/suppliers "$(jq -nc --arg name "SHREE AGENCY ${T}" '{name: $name}')"
expect_value "taken: why" "${REASON}" record_already_exists
expect 400 "a phone without +91" POST /app/suppliers "$(jq -nc --arg name "Bad phone ${T}" '{name: $name, phone: "9876543210"}')"
expect_value "bad phone: field" "${FIELDS}" body.phone
expect 400 "not a GSTIN" POST /app/suppliers "$(jq -nc --arg name "Bad GST ${T}" '{name: $name, gst_number: "123"}')"
expect_value "bad GSTIN: field" "${FIELDS}" body.gst_number
expect 200 "a second supplier" POST /app/suppliers "$(jq -nc --arg name "Other Agency ${T}" '{name: $name, is_quick: true}')"
OTHER_SUP="$(last '.data.id')"
expect 200 "suppliers of the brand" GET "/app/suppliers?manufacturer_id=${MFR}&q=${T}"
expect_value "only the first" '[.data[].id] | join(",")' "${SUP}"
expect 200 "clear the GSTIN" PATCH "/app/suppliers/${OTHER_SUP}" '{"gst_number":null,"phone":null}'
expect_value "no GSTIN" '.data.gst_number' null
expect 200 "get the supplier" GET "/app/suppliers/${SUP}"
expect 204 "delete the second (nothing owed)" DELETE "/app/suppliers/${OTHER_SUP}?${DELETE_REASON}"
expect 200 "restore it" POST "/app/suppliers/${OTHER_SUP}/restore"
expect 409 "restore a live one" POST "/app/suppliers/${OTHER_SUP}/restore"
expect_value "live: why" "${REASON}" record_not_deleted

# ==== 11.F Medical reps (routes 33–38) ============================================================
expect 200 "add an MR" POST /app/medical-reps "$(jq -nc --arg name "Alvio Pharma · Rakesh ${T}" --arg phone "+91${N}21" --arg mfr "${MFR}" --arg day "$(calendar_day 14)" '{name: $name, phone: $phone, next_visit_on: $day, manufacturer_ids: [$mfr]}')"
REP="$(last '.data.id')"
expect_value "the MR: brand, next visit, not overdue, no visit yet (MD17)" '[(.data.id | startswith("mrep_")), .data.manufacturers[0].id, .data.next_visit_on, .data.is_visit_overdue, (.data.last_visit_on | tostring)] | map(tostring) | join(",")' "true,${MFR},$(calendar_day 14),false,null"
expect 400 "a next visit 121 days on" POST /app/medical-reps "$(jq -nc --arg name "Far ${T}" --arg day "$(calendar_day 121)" '{name: $name, next_visit_on: $day}')"
expect_value "too far: field" "${FIELDS}" next_visit_on
expect 400 "a next visit yesterday" PATCH "/app/medical-reps/${REP}" "$(jq -nc --arg day "$(calendar_day -1)" '{next_visit_on: $day}')"
expect 200 "the manufacturer's MRs" GET "/app/manufacturers/${MFR}"
expect_value "the rep" '[.data.medical_reps[].id] | join(",")' "${REP}"
expect 200 "MRs of the brand, not overdue" GET "/app/medical-reps?manufacturer_id=${MFR}&is_visit_overdue=false"
expect_value "the rep is there" "[.data[].id] | index(\"${REP}\") != null" true
expect 200 "a second MR" POST /app/medical-reps "$(jq -nc --arg name "Rakesh ${T}" '{name: $name}')"
OTHER_REP="$(last '.data.id')"
expect 200 "MRs by next visit (none last)" GET "/app/medical-reps?q=${T}&sort=next_visit_on"
expect_value "the one with a visit first" '[.data[].id] | join(",")' "${REP},${OTHER_REP}"

# ==== 11.G MR visits (routes 39–43) ===============================================================
expect 200 "log a visit" POST "/app/medical-reps/${REP}/visits" "$(jq -nc --arg day "$(calendar_day 7)" '{samples: "2 strips Alvi-D", next_visit_on: $day, notes: "Launch next month"}')"
VISIT="$(last '.data.id')"
expect_value "the visit: today, by the caller (MD18)" '[(.data.id | startswith("mrv_")), .data.visit_date, .data.medical_rep_id, (.data.logged_by_membership_id != null)] | map(tostring) | join(",")' "true,${TODAY},${REP},true"
expect 200 "the MR after the visit" GET "/app/medical-reps/${REP}"
expect_value "next visit moved, the last visit shows" '[.data.next_visit_on, .data.last_visit_on, .data.last_samples] | join(",")' "$(calendar_day 7),${TODAY},2 strips Alvi-D"
expect 400 "a visit tomorrow" POST "/app/medical-reps/${REP}/visits" "{\"visit_date\":\"${TOMORROW}\"}"
expect_value "future: field" "${FIELDS}" visit_date
expect 400 "the next visit on the visit day" POST "/app/medical-reps/${REP}/visits" "{\"next_visit_on\":\"${TODAY}\"}"
expect_value "not after: field" "${FIELDS}" next_visit_on
expect 200 "an MR's visits" GET "/app/medical-reps/${REP}/visits"
expect_value "one visit" '.data | length' 1
expect 200 "get the visit" GET "/app/medical-reps/${REP}/visits/${VISIT}"
expect 404 "the visit under another MR" GET "/app/medical-reps/${OTHER_REP}/visits/${VISIT}"
expect 204 "delete the visit" DELETE "/app/medical-reps/${REP}/visits/${VISIT}?${DELETE_REASON}"
expect 200 "restore the visit" POST "/app/medical-reps/${REP}/visits/${VISIT}/restore"
expect 404 "visits of an MR not here" GET /app/medical-reps/mrep_000000000000000000000/visits

# The visit reminder (MD8): a visit due today opens the pharmacist's task; logging it closes it.
expect 200 "an MR due today" PATCH "/app/medical-reps/${OTHER_REP}" "{\"next_visit_on\":\"${TODAY}\"}"
run_task_rules
expect 200 "the MR visit tasks" GET "/app/tasks?scope=everyone&tab=open&rule_key=medical_rep_visit&limit=100"
expect_value "one task, the pharmacist queue" "[.data[] | select(.medical_rep_id == \"${OTHER_REP}\")] | [length, .[0].owner_role, .[0].title] | map(tostring) | join(\",\")" "1,pharmacist,Meet Rakesh ${T}"
expect 200 "log that visit" POST "/app/medical-reps/${OTHER_REP}/visits" '{"samples":"Brochure"}'
expect 200 "the MR, visit logged" GET "/app/medical-reps/${OTHER_REP}"
expect_value "no next visit now (it was due on the visit day)" '.data.next_visit_on' null
run_task_rules
expect 200 "the MR visit tasks after" GET "/app/tasks?scope=everyone&tab=open&rule_key=medical_rep_visit&limit=100"
expect_value "closed by Clinozy" "[.data[] | select(.medical_rep_id == \"${OTHER_REP}\")] | length" 0

# ==== 11.D Medicines (routes 17–24) ===============================================================
GLYCOLAC_BODY="$(jq -nc --arg name "Glycolac ${T}" --arg mfr "${MFR}" --arg sup "${SUP}" --arg soon "${NEXT_MONTH}" --arg later "${LATER}" \
  '{name: $name, composition: "Glycolic acid 6%", manufacturer_id: $mfr, mrp: 369, min_stock: 2, max_stock: 30,
    batches: [{batch_number: "B1", expiry_month: $soon, quantity: 5, purchase_rate: 246, supplier_id: $sup},
              {batch_number: "B2", expiry_month: $later, quantity: 3, purchase_rate: 240}],
    supplier_prices: [{supplier_id: $sup, rate: 246, lead_days: 2}]}')"
expect 200 "add a medicine with batches and prices" POST /app/medicines "${GLYCOLAC_BODY}"
GLYCOLAC="$(last '.data.id')"
expect_value "stock is the batches' sum (MD4)" '[(.data.id | startswith("med_")), .data.quantity, .data.stock_level, (.data.batches | length), .data.manufacturer.id] | map(tostring) | join(",")' "true,8,ok,2,${MFR}"
expect_value "nearest expiry, best rate, margin, before GST (MD12)" '[.data.nearest_expiry.batch_number, .data.nearest_expiry.expiry_month, .data.best_rate.rate, .data.best_rate.supplier_id, .data.margin_percent, .data.price_before_gst, .data.gst_percent] | map(tostring) | join(",")' "B1,${NEXT_MONTH},246,${SUP},33.33,329.46,12"
B1="$(last '[.data.batches[] | select(.batch_number == "B1") | .id] | first')"
expect 409 "the name in another case" POST /app/medicines "$(jq -nc --arg name "GLYCOLAC ${T}" --arg mfr "${MFR}" '{name: $name, manufacturer_id: $mfr, mrp: 10}')"
expect_value "taken: why" "${REASON}" record_already_exists
expect 400 "no MRP, not quick" POST /app/medicines "$(jq -nc --arg name "No MRP ${T}" --arg mfr "${MFR}" '{name: $name, manufacturer_id: $mfr}')"
expect_value "no MRP: field" "${FIELDS}" mrp
expect 400 "no manufacturer, not quick" POST /app/medicines "$(jq -nc --arg name "No brand ${T}" '{name: $name, mrp: 10}')"
expect_value "no brand: field" "${FIELDS}" manufacturer_id
expect 400 "fill-up below reorder" POST /app/medicines "$(jq -nc --arg name "Levels ${T}" --arg mfr "${MFR}" '{name: $name, manufacturer_id: $mfr, mrp: 10, min_stock: 5, max_stock: 3}')"
expect_value "levels: field" "${FIELDS}" max_stock
expect 400 "a batch number twice" POST /app/medicines "$(jq -nc --arg name "Twice ${T}" --arg mfr "${MFR}" --arg soon "${NEXT_MONTH}" '{name: $name, manufacturer_id: $mfr, mrp: 10, batches: [{batch_number: "X1", expiry_month: $soon, quantity: 1}, {batch_number: "x1", expiry_month: $soon, quantity: 1}]}')"
expect 200 "a quick medicine" POST /app/medicines "$(jq -nc --arg name "Quickmed ${T}" '{name: $name, is_quick: true}')"
QUICK_MED="$(last '.data.id')"
expect_value "quick: MRP 0, needs details, out" '[.data.is_quick, .data.mrp, .data.needs_details, .data.stock_level] | map(tostring) | join(",")' "true,0,true,out"
expect 200 "complete the quick one" PATCH "/app/medicines/${QUICK_MED}" "$(jq -nc --arg mfr "${QUICK_MFR}" '{mrp: 99, composition: "Zinc", manufacturer_id: $mfr}')"
expect_value "it loses its flag (MD12)" '[.data.is_quick, .data.needs_details] | map(tostring) | join(",")' "false,false"
expect 200 "batches as the whole list" PATCH "/app/medicines/${GLYCOLAC}" "$(jq -nc --arg b1 "${B1}" --arg soon "${NEXT_MONTH}" --arg later "${LATER}" --arg sup "${SUP}" \
  '{batches: [{id: $b1, batch_number: "B1", expiry_month: $soon, quantity: 6, purchase_rate: 246, supplier_id: $sup}, {batch_number: "B3", expiry_month: $later, quantity: 2}]}')"
expect_value "kept 6, added 2, B2 left out to 0 (MD13)" '[.data.quantity, ([.data.batches[].batch_number] | join("+"))] | map(tostring) | join(",")' "8,B1+B3"
expect 409 "a new batch with a left-out number" PATCH "/app/medicines/${GLYCOLAC}" "$(jq -nc --arg b1 "${B1}" --arg soon "${NEXT_MONTH}" --arg later "${LATER}" \
  '{batches: [{id: $b1, batch_number: "B1", expiry_month: $soon, quantity: 6}, {batch_number: "b2", expiry_month: $later, quantity: 1}]}')"
expect_value "batch taken: why" "${REASON}" record_already_exists
expect 400 "another medicine's batch id" PATCH "/app/medicines/${QUICK_MED}" "$(jq -nc --arg b1 "${B1}" --arg soon "${NEXT_MONTH}" '{batches: [{id: $b1, batch_number: "B1", expiry_month: $soon, quantity: 1}]}')"
expect_value "foreign batch: field" "${FIELDS}" batches
expect 200 "medicines in stock, expiring within 90 days" GET "/app/medicines?q=${T}&stock_level=ok&expiring_within_days=90"
expect_value "the batch of next month" '[.data[].id] | join(",")' "${GLYCOLAC}"
expect 200 "medicines out of stock" GET "/app/medicines?q=${T}&stock_level=out"
expect_value "the quick one, no batches" "[.data[].id] | index(\"${QUICK_MED}\") != null" true
expect 200 "medicines of the brand, a supplier's" GET "/app/medicines?manufacturer_id=${MFR}&supplier_id=${SUP}"
expect_value "the one with the supplier's price" '[.data[].id] | join(",")' "${GLYCOLAC}"
expect 200 "by number" GET "/app/medicines?q=%23$(api GET "/app/medicines/${GLYCOLAC}" >/dev/null; last '.data.medicine_number')"
expect_value "found by #number" '.data[0].id' "${GLYCOLAC}"
expect 200 "the near-expiry discount" POST /app/medicines/near-expiry-discount '{"expiring_within_days":90,"discount_percent":20}'
expect_value "at least this medicine changed" '.data.updated_count >= 1' true
expect 200 "the medicine after" GET "/app/medicines/${GLYCOLAC}"
expect_value "20% off near expiry (MD14)" '.data.near_expiry_discount_percent' 20
expect 400 "a window of 45 days" POST /app/medicines/near-expiry-discount '{"expiring_within_days":45,"discount_percent":20}'
expect 200 "the medicines CSV" GET "/app/medicines/exports?q=${T}"
expect_value "the file" '[(.data.file_name | startswith("medicines-")), .data.row_count] | map(tostring) | join(",")' "true,2"
expect 409 "delete a medicine with stock" DELETE "/app/medicines/${GLYCOLAC}?${DELETE_REASON}"
expect_value "stock: why" "${REASON}" medicine_has_stock
expect 409 "delete a manufacturer with medicines" DELETE "/app/manufacturers/${MFR}?${DELETE_REASON}"
expect_value "medicines: why" "${REASON}" manufacturer_has_medicines
expect 204 "delete the out-of-stock one" DELETE "/app/medicines/${QUICK_MED}?${DELETE_REASON}"
expect 200 "restore it" POST "/app/medicines/${QUICK_MED}/restore"

# ==== 11.E Medical purchase orders (routes 25–32) =================================================
PO_BODY="$(jq -nc --arg sup "${SUP}" --arg med "${GLYCOLAC}" --arg new "Newderm ${T}" \
  '{supplier_id: $sup, supplier_bill_number: "SMA-1", items: [{medicine_id: $med, quantity: 10, free_quantity: 1, rate: 246}, {new_medicine_name: $new, quantity: 5, rate: 100}]}')"
expect 200 "order from the supplier" POST /app/medical-purchase-orders "${PO_BODY}"
PO="$(last '.data.id')"
expect_value "ordered: total, nothing due yet (MD15)" '[(.data.id | startswith("mpo_")), .data.stage, .data.total, .data.due_amount, .data.payment_status, .data.item_count, .data.free_count, .data.supplier.id] | map(tostring) | join(",")' "true,ordered,2960,0,unpaid,2,1,${SUP}"
LINE_ONE="$(last '.data.items[0].id')"
LINE_TWO="$(last '.data.items[1].id')"
expect 200 "the line added as typed" GET "/app/medicines?q=Newderm%20${T}"
expect_value "a quick medicine, the supplier's brand" '[.data[0].is_quick, .data[0].mrp, .data[0].manufacturer.id, .data[0].best_rate.rate] | map(tostring) | join(",")' "true,0,${MFR},100"
expect 400 "an order dated tomorrow" POST /app/medical-purchase-orders "$(jq -nc --arg sup "${SUP}" --arg med "${GLYCOLAC}" --arg day "${TOMORROW}" '{supplier_id: $sup, order_date: $day, items: [{medicine_id: $med, quantity: 1, rate: 1}]}')"
expect_value "future: field" "${FIELDS}" order_date
expect 400 "an order without lines" POST /app/medical-purchase-orders "$(jq -nc --arg sup "${SUP}" '{supplier_id: $sup, items: []}')"
expect 400 "a line with both" POST /app/medical-purchase-orders "$(jq -nc --arg sup "${SUP}" --arg med "${GLYCOLAC}" '{supplier_id: $sup, items: [{medicine_id: $med, new_medicine_name: "x", quantity: 1, rate: 1}]}')"
expect 200 "a second order" POST /app/medical-purchase-orders "$(jq -nc --arg sup "${SUP}" --arg med "${GLYCOLAC}" '{supplier_id: $sup, items: [{medicine_id: $med, quantity: 2, rate: 250}]}')"
PO_TWO="$(last '.data.id')"
expect 200 "change its lines" PATCH "/app/medical-purchase-orders/${PO_TWO}" "$(jq -nc --arg med "${GLYCOLAC}" '{items: [{medicine_id: $med, quantity: 4, rate: 250}]}')"
expect_value "the new total" '.data.total' 1000
expect 204 "cancel it" DELETE "/app/medical-purchase-orders/${PO_TWO}?reason=supplier_cant_deliver"
expect 400 "cancel with a stock reason" DELETE "/app/medical-purchase-orders/${PO}?reason=duplicate"
expect 200 "undo the cancel" POST "/app/medical-purchase-orders/${PO_TWO}/restore"
expect_value "ordered again" '.data.stage' ordered
BEFORE="$(stock_of "${GLYCOLAC}")"
expect 200 "receive the goods" POST "/app/medical-purchase-orders/${PO}/receive" "$(jq -nc --arg one "${LINE_ONE}" --arg two "${LINE_TWO}" --arg exp "${LATEST}" '{supplier_bill_number: "SMA-2291", items: [{id: $one, batch_number: "GC-PO", expiry_month: $exp}, {id: $two, is_received: false}]}')"
expect_value "received: the received lines' total, due, the bill number (MD16)" '[.data.stage, .data.total, .data.due_amount, .data.payment_status, .data.supplier_bill_number, .data.items[0].is_received, .data.items[1].is_received] | map(tostring) | join(",")' "received,2460,2460,unpaid,SMA-2291,true,false"
expect_equal "11 packs into the batch (10 + 1 free)" "$(( $(stock_of "${GLYCOLAC}") - BEFORE ))" 11
expect_equal "the new batch" "$(batch_stock "${GLYCOLAC}" GC-PO)" 11
expect 409 "receive again" POST "/app/medical-purchase-orders/${PO}/receive" '{}'
expect_value "received: why" "${REASON}" transition_not_allowed
expect 409 "change a received order" PATCH "/app/medical-purchase-orders/${PO}" '{"supplier_bill_number":"x"}'
expect 409 "cancel a received order" DELETE "/app/medical-purchase-orders/${PO}?reason=mistake"
expect 200 "the Purchases tab, received" GET "/app/medical-purchase-orders?supplier_id=${SUP}&stage=received"
expect_value "the received order" '[.data[].id] | join(",")' "${PO}"
expect 200 "by number" GET "/app/medical-purchase-orders?q=%23$(api GET "/app/medical-purchase-orders/${PO}" >/dev/null; last '.data.purchase_order_number')"
expect_value "found" '.data[0].id' "${PO}"
expect 200 "the orders CSV" GET "/app/medical-purchase-orders/exports?supplier_id=${SUP}"
expect_value "two orders" '.data.row_count' 2
expect 200 "the supplier owes now" GET "/app/suppliers/${SUP}"
expect_value "payable, ageing, orders (MD10)" '[.data.payable, .data.ageing_days, .data.order_count] | map(tostring) | join(",")' "2460,0,2"
expect 409 "delete a supplier owed" DELETE "/app/suppliers/${SUP}?${DELETE_REASON}"
expect_value "owed: why" "${REASON}" supplier_has_dues

# ==== 11.C Supplier credits (routes 14–16) ========================================================
expect 200 "return expiring stock" POST /app/supplier-credits "$(jq -nc --arg batch "${B1}" --arg sup "${SUP}" '{medicine_batch_id: $batch, supplier_id: $sup, quantity: 1}')"
CREDIT="$(last '.data.id')"
expect_value "at the batch rate, applied at once (MD11)" '[(.data.id | startswith("scr_")), .data.rate, .data.amount, .data.applied_amount, .data.status, .data.batch_number, .data.supplier_id] | map(tostring) | join(",")' "true,246,246,246,adjusted,B1,${SUP}"
expect_equal "out of the batch" "$(batch_stock "${GLYCOLAC}" B1)" 5
expect 200 "the order credited" GET "/app/medical-purchase-orders/${PO}"
expect_value "credited, still due" '[.data.credited_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")' "246,2214,partial"
expect 409 "more than the batch holds" POST /app/supplier-credits "$(jq -nc --arg batch "${B1}" --arg sup "${SUP}" '{medicine_batch_id: $batch, supplier_id: $sup, quantity: 99}')"
expect_value "stock: why" "${REASON}" not_enough_stock
expect 400 "a supplier not here" POST /app/supplier-credits "$(jq -nc --arg batch "${B1}" '{medicine_batch_id: $batch, supplier_id: "sup_000000000000000000000", quantity: 1}')"
expect 200 "a supplier's credits" GET "/app/supplier-credits?supplier_id=${SUP}&status=adjusted"
expect_value "the credit" '[.data[].id] | join(",")' "${CREDIT}"
expect 200 "get the credit" GET "/app/supplier-credits/${CREDIT}"

# ==== 11.B Pay a supplier (route 13) ==============================================================
expect 409 "pay more than owed" POST "/app/suppliers/${SUP}/payments" "$(jq -nc --arg branch "${VESU}" '{branch_id: $branch, splits: [{mode: "cash", amount: 99999}]}')"
expect_value "too much: why" "${REASON}" more_than_due
expect 400 "pay with credit" POST "/app/suppliers/${SUP}/payments" "$(jq -nc --arg branch "${VESU}" '{branch_id: $branch, splits: [{mode: "credit", amount: 10}]}')"
expect 200 "pay ₹1,000" POST "/app/suppliers/${SUP}/payments" "$(jq -nc --arg branch "${VESU}" '{branch_id: $branch, splits: [{mode: "cash", amount: 600}, {mode: "upi", amount: 400}], reference: "UTR-1"}')"
expect_value "what is left (MD10)" '.data.payable' 1214
expect 200 "the order's payments" GET "/app/payments?medical_purchase_order_id=${PO}"
expect_value "one supplier bill" '[(.data | length), .data[0].kind, .data[0].amount, .data[0].medical_purchase_order_id] | map(tostring) | join(",")' "1,supplier_bill,1000,${PO}"
expect 400 "a receipt naming the order" POST /app/payments "$(jq -nc --arg branch "${VESU}" --arg po "${PO}" '{kind: "expense", branch_id: $branch, expense_category: "medicines", payee_name: "x", medical_purchase_order_id: $po, splits: [{mode: "cash", amount: 1}]}')"
expect_value "only a supplier bill: field" "${FIELDS}" medical_purchase_order_id
expect 200 "a supplier bill on the order (MD7)" POST /app/payments "$(jq -nc --arg branch "${VESU}" --arg po "${PO}" '{kind: "supplier_bill", branch_id: $branch, payee_name: "Shree Agency", medical_purchase_order_id: $po, splits: [{mode: "upi", amount: 214}]}')"
expect 200 "the order after" GET "/app/medical-purchase-orders/${PO}"
expect_value "paid 1,214, due 1,000" '[.data.paid_amount, .data.due_amount] | map(tostring) | join(",")' "1214,1000"
expect 409 "a supplier bill over the due" POST /app/payments "$(jq -nc --arg branch "${VESU}" --arg po "${PO}" '{kind: "supplier_bill", branch_id: $branch, payee_name: "x", medical_purchase_order_id: $po, splits: [{mode: "cash", amount: 1001}]}')"
expect_value "over: why" "${REASON}" more_than_due
expect 409 "a supplier bill on an order not received" POST /app/payments "$(jq -nc --arg branch "${VESU}" --arg po "${PO_TWO}" '{kind: "supplier_bill", branch_id: $branch, payee_name: "x", medical_purchase_order_id: $po, splits: [{mode: "cash", amount: 1}]}')"

# ==== 11.H Medical sales (routes 44–51) ===========================================================
expect 200 "contact Asha" POST /app/contacts "$(jq -nc --arg last "${T}" --arg phone "+91${N}31" '{first_name: "Asha", last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
ASHA="$(last '.data.id')"
expect 200 "Asha's file" POST /app/patients "{\"contact_id\":\"${ASHA}\",\"home_branch_id\":\"${VESU}\"}"
ASHA_FILE="$(last '.data.id')"
expect 200 "contact Bela, no file" POST /app/contacts "$(jq -nc --arg last "${T}" --arg phone "+91${N}32" '{first_name: "Bela", last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
BELA="$(last '.data.id')"
expect 200 "remove the near-expiry discount" POST /app/medicines/near-expiry-discount '{"expiring_within_days":90,"discount_percent":null}'
SALE_BODY="$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg med "${GLYCOLAC}" --arg doctor "${DOCTOR}" '{branch_id: $branch, contact_id: $contact, member_ids: [$doctor], items: [{medicine_id: $med, quantity: 2}]}')"
expect 200 "sell two" POST /app/medical-sales "${SALE_BODY}"
SALE="$(last '.data.id')"
INVOICE="$(last '.data.invoice.id')"
LINE="$(last '.data.items[0].invoice_item_id')"
expect_value "unpaid, its medical invoice, from the earliest batch (MD5, MD19)" '[(.data.id | startswith("msal_")), .data.status, .data.invoice.total, .data.invoice.due_amount, .data.items[0].batch_number, .data.items[0].quantity, .data.contact.id, .data.patient_id, .data.member_ids[0]] | map(tostring) | join(",")' "true,unpaid,738,738,B1,2,${ASHA},${ASHA_FILE},${DOCTOR}"
expect_value "the margin over the batch's rate" '[.data.margin_amount, .data.margin_percent] | map(tostring) | join(",")' "246,33.33"
expect_equal "two out of B1" "$(batch_stock "${GLYCOLAC}" B1)" 3
expect 200 "sell one, paid now" POST /app/medical-sales "$(jq -nc --arg branch "${VESU}" --arg contact "${BELA}" --arg med "${GLYCOLAC}" '{branch_id: $branch, contact_id: $contact, items: [{medicine_id: $med, quantity: 1}], payment: {splits: [{mode: "cash", amount: 369}]}}')"
PAID_SALE="$(last '.data.id')"
expect_value "paid now (B13)" '[.data.status, .data.invoice.paid_amount] | map(tostring) | join(",")' "paid,369"
expect 200 "sell across two batches" POST /app/medical-sales "$(jq -nc --arg branch "${VESU}" --arg contact "${BELA}" --arg med "${GLYCOLAC}" '{branch_id: $branch, contact_id: $contact, items: [{medicine_id: $med, quantity: 3}]}')"
SPLIT_SALE="$(last '.data.id')"
expect_value "B1's last two, then B3 (MD5)" '[.data.items[] | "\(.batch_number)x\(.quantity)"] | join(",")' "B1x2,B3x1"
expect 409 "more than the unexpired batches hold" POST /app/medical-sales "$(jq -nc --arg branch "${VESU}" --arg contact "${BELA}" --arg med "${GLYCOLAC}" '{branch_id: $branch, contact_id: $contact, items: [{medicine_id: $med, quantity: 999}]}')"
expect_value "stock: why" "${REASON}" not_enough_stock
expect 400 "a medicine twice" POST /app/medical-sales "$(jq -nc --arg branch "${VESU}" --arg contact "${BELA}" --arg med "${GLYCOLAC}" '{branch_id: $branch, contact_id: $contact, items: [{medicine_id: $med, quantity: 1}, {medicine_id: $med, quantity: 1}]}')"
expect 400 "a contact not here" POST /app/medical-sales "$(jq -nc --arg branch "${VESU}" --arg med "${GLYCOLAC}" '{branch_id: $branch, contact_id: "con_000000000000000000000", items: [{medicine_id: $med, quantity: 1}]}')"
expect_value "unknown contact: field" "${FIELDS}" contact_id
expect 200 "the Sales tab, unpaid" GET "/app/medical-sales?status=unpaid&contact_id=${ASHA}"
expect_value "Asha's sale" '[.data[].id] | join(",")' "${SALE}"
expect 200 "search a medicine's name" GET "/app/medical-sales?q=Glycolac%20${T}&sort=sale_number"
expect_value "the three sales" '.data | length' 3
expect 409 "void a paid sale" DELETE "/app/medical-sales/${PAID_SALE}?reason=wrong_items"
expect_value "paid: why" "${REASON}" sale_has_payments
expect 400 "void with a stock reason" DELETE "/app/medical-sales/${SPLIT_SALE}?reason=mistake"
expect 204 "void the split sale" DELETE "/app/medical-sales/${SPLIT_SALE}?reason=customer_changed_mind"
expect_equal "its stock back into B1" "$(batch_stock "${GLYCOLAC}" B1)" 2
expect 200 "the voided sales" GET "/app/medical-sales?status=voided&contact_id=${BELA}"
expect_value "the split sale, voided" '[.data[].id, .data[0].status] | join(",")' "${SPLIT_SALE},voided"
expect 200 "undo the void" POST "/app/medical-sales/${SPLIT_SALE}/restore"
expect_value "unpaid again, stock taken again" '.data.status' unpaid
expect_equal "B1 empty again" "$(batch_stock "${GLYCOLAC}" B1)" 0
expect 409 "change the sale's invoice through /invoices" PATCH "/app/invoices/${INVOICE}" '{"remark":"x"}'
expect_value "the sale's: why" "${REASON}" invoice_of_sale
expect 409 "delete the sale's invoice through /invoices" DELETE "/app/invoices/${INVOICE}?${DELETE_REASON}"
expect 409 "return an unpaid sale" POST "/app/medical-sales/${SALE}/returns" "$(jq -nc --arg line "${LINE}" '{items: [{invoice_item_id: $line, quantity: 1}], reason: "unused", refund_mode: "cash"}')"
expect_value "unpaid: why" "${REASON}" sale_not_paid
expect 200 "collect the sale" POST /app/payments "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg invoice "${INVOICE}" '{kind: "receipt", branch_id: $branch, contact_id: $contact, invoice_id: $invoice, splits: [{mode: "upi", amount: 738}]}')"
expect 400 "return more than was sold" POST "/app/medical-sales/${SALE}/returns" "$(jq -nc --arg line "${LINE}" '{items: [{invoice_item_id: $line, quantity: 3}], reason: "unused", refund_mode: "cash"}')"
expect_value "too many: field" "${FIELDS}" items
expect 200 "return one, unused" POST "/app/medical-sales/${SALE}/returns" "$(jq -nc --arg line "${LINE}" '{items: [{invoice_item_id: $line, quantity: 1}], reason: "unused", refund_mode: "cash", note: "Sealed"}')"
expect_value "returned: the refund, the line's count (MD21)" '[.data.status, .data.returned_amount, .data.items[0].returned_quantity, (.data.returns[0].id | startswith("msrt_")), .data.returns[0].items[0].is_restocked, (.data.returns[0].invoice_credit_note_id != null)] | map(tostring) | join(",")' "returned,369,1,true,true,true"
expect_equal "back into B1" "$(batch_stock "${GLYCOLAC}" B1)" 1
expect 200 "return the other, damaged" POST "/app/medical-sales/${SALE}/returns" "$(jq -nc --arg line "${LINE}" '{items: [{invoice_item_id: $line, quantity: 1}], reason: "damaged", refund_mode: "upi"}')"
expect_value "two returns, written off" '[(.data.returns | length), .data.returns[1].items[0].is_restocked, .data.returned_amount] | map(tostring) | join(",")' "2,false,738"
expect_equal "not back into B1" "$(batch_stock "${GLYCOLAC}" B1)" 1
expect 409 "void a returned sale" DELETE "/app/medical-sales/${SALE}?reason=wrong_items"
expect 200 "the sales CSV" GET "/app/medical-sales/exports?contact_id=${BELA}"
expect_value "Bela's two" '.data.row_count' 2
expect 200 "the store's payments (MD22)" GET "/app/medical-payments?q=Shree"
expect_value "the supplier bills" '[.data[] | select(.medical_purchase_order_id == "'"${PO}"'")] | length' 2
expect 200 "the store's receipts and refunds" GET "/app/medical-payments?contact_id=${ASHA}"
expect_value "the receipt and two refunds" '[.data[].kind] | sort | join(",")' "receipt,refund,refund"

# A prescription filled once (MD19) — the pharmacy queue is `is_filled=false` (MDC4).
LINE_BODY="$(jq -nc --arg medicine "${GLYCOLAC}" '{medicine_name: "Glycolac", medicine_id: $medicine, dose_night: 1, meal: "after", quantity: 1}')"
expect 200 "a draft prescription" POST "/app/patients/${ASHA_FILE}/prescriptions" "$(jq -nc --arg doctor "${DOCTOR}" --arg day "${TODAY}" --argjson line "${LINE_BODY}" '{doctor_membership_id: $doctor, prescription_date: $day, items: [$line]}')"
RX="$(last '.data.id')"
as_role doctor
expect 200 "the doctor approves" POST "/app/patients/${ASHA_FILE}/prescriptions/${RX}/approve"
as_role owner
expect 200 "prescriptions to fill" GET "/app/patient-prescriptions?status=approved&is_filled=false&patient_id=${ASHA_FILE}"
expect_value "the prescription is to fill" "[.data[].id] | index(\"${RX}\") != null" true
expect 400 "fill another contact's prescription" POST /app/medical-sales "$(jq -nc --arg branch "${VESU}" --arg contact "${BELA}" --arg med "${GLYCOLAC}" --arg rx "${RX}" '{branch_id: $branch, contact_id: $contact, patient_prescription_id: $rx, items: [{medicine_id: $med, quantity: 1}]}')"
expect_value "not the buyer's: field" "${FIELDS}" patient_prescription_id
expect 200 "fill the prescription" POST /app/medical-sales "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg med "${GLYCOLAC}" --arg rx "${RX}" '{branch_id: $branch, contact_id: $contact, patient_prescription_id: $rx, items: [{medicine_id: $med, quantity: 1}]}')"
expect_value "the sale names it" '.data.patient_prescription_id' "${RX}"
expect 409 "fill it again" POST /app/medical-sales "$(jq -nc --arg branch "${VESU}" --arg contact "${ASHA}" --arg med "${GLYCOLAC}" --arg rx "${RX}" '{branch_id: $branch, contact_id: $contact, patient_prescription_id: $rx, items: [{medicine_id: $med, quantity: 1}]}')"
expect_value "filled: why" "${REASON}" prescription_filled
expect 200 "prescriptions filled" GET "/app/patient-prescriptions?is_filled=true&patient_id=${ASHA_FILE}"
expect_value "the prescription is filled" "[.data[].id] | index(\"${RX}\") != null" true
expect 404 "a sale not here" GET /app/medical-sales/msal_000000000000000000000

# ==== The medicine codes by role (MD2) ============================================================
as_role pharmacist
expect 200 "the pharmacist lists medicines" GET "/app/medicines?q=${T}"
expect 200 "the pharmacist adds a manufacturer" POST /app/manufacturers "$(jq -nc --arg name "Pharmacist brand ${T}" '{name: $name}')"
expect 403 "the pharmacist can't delete" DELETE "/app/manufacturers/${QUICK_MFR}?${DELETE_REASON}"
expect 403 "the pharmacist can't export" GET "/app/medicines/exports"
as_role accountant
expect 200 "the accountant reads the store" GET "/app/medical-sales?contact_id=${ASHA}"
expect 200 "the accountant exports" GET "/app/medical-sales/exports?contact_id=${ASHA}"
expect 403 "the accountant can't add" POST /app/medicines "$(jq -nc --arg name "Accountant ${T}" --arg mfr "${MFR}" '{name: $name, manufacturer_id: $mfr, mrp: 1}')"
as_role doctor
expect 200 "the doctor reads medicines" GET "/app/medicines?q=${T}"
expect 403 "the doctor can't sell" POST /app/medical-sales "${SALE_BODY}"
as_role front_desk
expect 403 "the front desk sees no store" GET /app/medicines
as_role owner
