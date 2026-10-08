#!/usr/bin/env bash
# TEMPORARY — sub-domain 9, Stock 9.A–9.E (routes-final §9, launch ROUTE #137): items with their
# opening quantity, level and how long they last; the movement ledger — every change one row, the
# guarded balance, reverts; counts that adjust what differs; purchases that receive their lines and
# are paid by supplier bills; vendors and what they are owed. Sourced by run-live-api-checks.sh after
# live-api.sh; every name carries the run suffix, so the file replays on one fixture.
S="${LIVE_API_RUN:-$(date +%s)}"
T="s${S}"
# Ten-digit numbers unique to the run: 6 + the run's last 7 digits + two more.
N="6${S: -7}"
FIELDS='[.error.errors[].field] | join(",")'
REASON='.error.reason'
VESU="$(fixture '.branches.vesu')"
TOMORROW="$(calendar_day 1)"

# item NAME [EXTRA_JSON] — adds a stock item of this run; sets LAST_ITEM.
item() {
  local extra="${2:-}"
  [ -n "${extra}" ] || extra='{}'
  expect 200 "item $1" POST /app/stock-items \
    "$(jq -nc --arg name "$1 ${S}" --argjson extra "${extra}" '{name: $name} + $extra')"
  LAST_ITEM="$(last '.data.id')"
}

# move ITEM TYPE QUANTITY [EXTRA_JSON] — a POST /app/stock-items/{ITEM}/movements body.
move() {
  local extra="${4:-}"
  [ -n "${extra}" ] || extra='{}'
  jq -nc --arg type "$2" --argjson quantity "$3" --argjson extra "${extra}" \
    '{type: $type, quantity: $quantity} + $extra'
}

as_role owner
# A patient file with one session done and one reversed — what a use can name (S14).
expect 200 "contact Meera" POST /app/contacts "$(jq -nc --arg last "${T}" --arg phone "+91${N}31" \
  '{first_name: "Meera", last_name: $last, phones: [{phone: $phone, is_primary: true}]}')"
MEERA="$(last '.data.id')"
expect 200 "Meera's file" POST /app/patients "{\"contact_id\":\"${MEERA}\",\"home_branch_id\":\"${VESU}\"}"
MEERA_FILE="$(last '.data.id')"
expect 200 "a peel session" POST "/app/patients/${MEERA_FILE}/treatments" '{"name":"Glycolic peel"}'
SESSION="$(last '.data.id')"
expect 200 "a session to reverse" POST "/app/patients/${MEERA_FILE}/treatments" '{"name":"Glycolic peel"}'
REVERSED_SESSION="$(last '.data.id')"
expect 200 "reverse it" POST "/app/patients/${MEERA_FILE}/treatments/${REVERSED_SESSION}/reverse" '{"reason":"Wrong patient"}'

# ==== 9.E Stock vendors (routes 23–28) ===========================================================
expect 200 "add a vendor" POST /app/stock-vendors \
  "$(jq -nc --arg name "Skin Supplies ${S}" --arg phone "+91${N}41" '{name: $name, phone: $phone}')"
VENDOR="$(last '.data.id')"
expect_value "the vendor: prefix, phone, not quick, nothing owed" '[(.data.id | startswith("svnd_")), .data.phone, .data.is_quick, .data.payable] | map(tostring) | join(",")' "true,+91${N}41,false,0"
expect 409 "the name in another case (S13)" POST /app/stock-vendors "$(jq -nc --arg name "SKIN SUPPLIES ${S}" '{name: $name}')"
expect_value "taken: why" "${REASON}" record_already_exists
expect 400 "a phone without +91" POST /app/stock-vendors "$(jq -nc --arg name "Bad phone ${S}" '{name: $name, phone: "9876543210"}')"
expect_value "bad phone: field" "${FIELDS}" body.phone
expect 400 "a vendor without a name" POST /app/stock-vendors '{}'
expect_value "no name: field" "${FIELDS}" body.name
expect 200 "a vendor added inline" POST /app/stock-vendors "$(jq -nc --arg name "Quick vendor ${S}" '{name: $name, is_quick: true}')"
QUICK_VENDOR="$(last '.data.id')"
expect_value "inline: is_quick" '.data.is_quick' true
expect 200 "the picker by name" GET "/app/stock-vendors?q=${S}"
expect_value "A–Z: both" '[.data[].id] | join(",")' "${QUICK_VENDOR},${VENDOR}"
expect 200 "newest first" GET "/app/stock-vendors?q=${S}&sort=created_at&order=desc"
expect_value "newest: the inline one" '.data[0].id' "${QUICK_VENDOR}"
expect 200 "get the vendor" GET "/app/stock-vendors/${VENDOR}"
expect 200 "clear the phone" PATCH "/app/stock-vendors/${VENDOR}" '{"phone":null}'
expect_value "no phone" '.data.phone' null
expect 409 "rename to a taken name" PATCH "/app/stock-vendors/${QUICK_VENDOR}" "$(jq -nc --arg name "Skin supplies ${S}" '{name: $name}')"
expect 400 "a change with nothing in it" PATCH "/app/stock-vendors/${VENDOR}" '{}'
expect 400 "is_quick is set once" PATCH "/app/stock-vendors/${VENDOR}" '{"is_quick":true}'
expect 404 "a vendor not here" GET /app/stock-vendors/svnd_000000000000000000000

# ==== 9.A Stock items (routes 1–7) ===============================================================
item "Glycolic peel" "$(jq -nc --arg vendor "${VENDOR}" '{category: "peels", unit: "bottle", size_per_unit: 30, measure_unit: "ml", min_quantity: 2, max_quantity: 6, usage_per_week: 1.5, stock_vendor_id: $vendor, opening_quantity: 5}')"
PEEL="${LAST_ITEM}"
expect_value "the opening moved in (S6): quantity, level, lasts" '[(.data.id | startswith("sitm_")), .data.quantity, .data.stock_level, .data.lasts_days, .data.stock_vendor_id, (.data.stock_item_number > 0)] | map(tostring) | join(",")' "true,5,ok,23,${VENDOR},true"
PEEL_NUMBER="$(last '.data.stock_item_number')"
item "Gauze"
GAUZE="${LAST_ITEM}"
expect_value "defaults: consumables, piece, 1–10, out, no usage" '[.data.category, .data.unit, .data.min_quantity, .data.max_quantity, .data.quantity, .data.stock_level, .data.lasts_days, .data.last_rate] | map(tostring) | join(",")' "consumables,piece,1,10,0,out,null,null"
expect 400 "a size without its measure" POST /app/stock-items "$(jq -nc --arg name "Sized ${S}" '{name: $name, size_per_unit: 30}')"
expect_value "no measure: field" "${FIELDS}" measure_unit
expect 400 "a measure without its size" POST /app/stock-items "$(jq -nc --arg name "Measured ${S}" '{name: $name, measure_unit: "g"}')"
expect_value "no size: field" "${FIELDS}" size_per_unit
expect 400 "a size of 0" POST /app/stock-items "$(jq -nc --arg name "Zero ${S}" '{name: $name, size_per_unit: 0, measure_unit: "g"}')"
expect_value "size 0: field" "${FIELDS}" body.size_per_unit
expect 400 "a maximum under the minimum" POST /app/stock-items "$(jq -nc --arg name "Levels ${S}" '{name: $name, min_quantity: 5, max_quantity: 2}')"
expect_value "levels: field" "${FIELDS}" max_quantity
expect 400 "a maximum under the default minimum" POST /app/stock-items "$(jq -nc --arg name "Levels two ${S}" '{name: $name, max_quantity: 0.5}')"
expect_value "default minimum: field" "${FIELDS}" max_quantity
expect 400 "four decimals" POST /app/stock-items "$(jq -nc --arg name "Fine ${S}" '{name: $name, opening_quantity: 1.2345}')"
expect_value "decimals: field" "${FIELDS}" body.opening_quantity
expect 409 "the name in another case" POST /app/stock-items "$(jq -nc --arg name "GAUZE ${S}" '{name: $name}')"
expect_value "taken: why" "${REASON}" record_already_exists
expect 400 "an unknown vendor" POST /app/stock-items "$(jq -nc --arg name "Vendorless ${S}" '{name: $name, stock_vendor_id: "svnd_000000000000000000000"}')"
expect_value "unknown vendor: field" "${FIELDS}" stock_vendor_id
expect 400 "the quantity is never patched (S5)" PATCH "/app/stock-items/${PEEL}" '{"quantity":9}'
expect 400 "nor the opening" PATCH "/app/stock-items/${PEEL}" '{"opening_quantity":9}'
expect 400 "nor the last rate" PATCH "/app/stock-items/${PEEL}" '{"last_rate":9}'
expect 200 "raise the minimum to 6" PATCH "/app/stock-items/${PEEL}" '{"min_quantity":6}'
expect_value "low now" '[.data.min_quantity, .data.stock_level] | map(tostring) | join(",")' "6,low"
expect 400 "a maximum under the stored minimum" PATCH "/app/stock-items/${PEEL}" '{"max_quantity":1}'
expect_value "stored minimum: field" "${FIELDS}" max_quantity
expect 400 "clearing the size keeps the measure" PATCH "/app/stock-items/${PEEL}" '{"size_per_unit":null}'
expect_value "size cleared alone: field" "${FIELDS}" size_per_unit
expect 200 "clear both" PATCH "/app/stock-items/${PEEL}" '{"size_per_unit":null,"measure_unit":null}'
expect 200 "low items" GET "/app/stock-items?q=${S}&stock_level=low"
expect_value "low: the peel" '[.data[].id] | join(",")' "${PEEL}"
expect 200 "out of stock" GET "/app/stock-items?q=${S}&stock_level=out"
expect_value "out: the gauze" '[.data[].id] | join(",")' "${GAUZE}"
expect 200 "low or out — Reorder" GET "/app/stock-items?q=${S}&stock_level=low,out"
expect_value "both, A–Z" '[.data[].id] | join(",")' "${GAUZE},${PEEL}"
expect 200 "by category" GET "/app/stock-items?q=${S}&category=peels"
expect_value "peels" '[.data[].id] | join(",")' "${PEEL}"
expect 200 "by the number" GET "/app/stock-items?q=%23${PEEL_NUMBER}"
expect_value "the number finds it" "[.data[].id | select(. == \"${PEEL}\")] | length" 1
expect 200 "by vendor" GET "/app/stock-items?stock_vendor_id=${VENDOR}"
expect_value "the vendor's" '[.data[].id] | join(",")' "${PEEL}"
expect 200 "by quantity, most first" GET "/app/stock-items?q=${S}&sort=quantity&order=desc"
expect_value "the peel first" '.data[0].id' "${PEEL}"
expect 200 "by how long it lasts, none last" GET "/app/stock-items?q=${S}&sort=lasts_days&order=desc"
expect_value "the peel, then the gauze" '[.data[].id] | join(",")' "${PEEL},${GAUZE}"
expect 200 "by number, newest first" GET "/app/stock-items?q=${S}&sort=stock_item_number"
expect_value "the gauze first" '.data[0].id' "${GAUZE}"
expect 400 "an unknown level" GET "/app/stock-items?stock_level=empty"
expect 200 "the items CSV" GET "/app/stock-items/exports?q=${S}"
expect_value "CSV: name, rows" '[(.data.file_name | startswith("stock-items-")), .data.row_count] | map(tostring) | join(",")' "true,2"
expect 409 "delete an item with stock (S6)" DELETE "/app/stock-items/${PEEL}?reason=mistake"
expect_value "has stock: why" "${REASON}" item_has_stock

# ==== 9.B Stock item movements (routes 8–12) ======================================================
expect 200 "use 1.5 in Meera's session (S14)" POST "/app/stock-items/${PEEL}/movements" \
  "$(move "${PEEL}" used 1.5 "$(jq -nc --arg session "${SESSION}" '{used_for: "Peel session", patient_treatment_id: $session, note: "Left cheek"}')")"
USED="$(last '.data.id')"
expect_value "signed by the server, the balance left, the author" '[(.data.id | startswith("smov_")), .data.type, .data.quantity_change, .data.quantity_after, .data.patient_treatment_id, (.data.author_membership_id != null), .data.reverted_by_stock_item_movement_id] | map(tostring) | join(",")' "true,used,-1.5,3.5,${SESSION},true,null"
expect 400 "a use in a reversed session" POST "/app/stock-items/${PEEL}/movements" \
  "$(move "${PEEL}" used 1 "$(jq -nc --arg session "${REVERSED_SESSION}" '{patient_treatment_id: $session}')")"
expect_value "reversed session: field" "${FIELDS}" patient_treatment_id
expect 400 "an unknown session" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" used 1 '{"patient_treatment_id":"ptrt_000000000000000000000"}')"
expect_value "unknown session: field" "${FIELDS}" patient_treatment_id
expect 400 "Used for on a receipt" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" received 1 '{"used_for":"X"}')"
expect_value "used_for: field" "${FIELDS}" body.used_for
expect 400 "a session on damage" POST "/app/stock-items/${PEEL}/movements" \
  "$(move "${PEEL}" damaged 1 "$(jq -nc --arg session "${SESSION}" '{patient_treatment_id: $session}')")"
expect_value "session on damage: field" "${FIELDS}" body.patient_treatment_id
expect 400 "a receipt of 0" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" received 0)"
expect_value "0: field" "${FIELDS}" body.quantity
expect 400 "an opening by hand" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" opening 1)"
expect 409 "damage more than is left (S5)" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" damaged 10)"
expect_value "not enough: why" "${REASON}" not_enough_stock
expect 400 "an adjust to what is there" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" adjust 3.5)"
expect_value "nothing to adjust: field" "${FIELDS}" quantity
expect 200 "adjust to the counted 4" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" adjust 4 '{"note":"Shelf count"}')"
expect_value "the difference written" '[.data.type, .data.quantity_change, .data.quantity_after] | map(tostring) | join(",")' "adjust,0.5,4"
expect 200 "return 1 to the vendor" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" returned 1)"
expect_value "returned: −1, 3 left" '[.data.quantity_change, .data.quantity_after] | map(tostring) | join(",")' "-1,3"
expect 200 "the item's history" GET "/app/stock-items/${PEEL}/movements"
expect_value "newest first: returned, adjust, used, opening" '[.data[].type] | join(",")' "returned,adjust,used,opening"
OPENING="$(last '.data[3].id')"
expect 200 "the Movements tab: this item's uses" GET "/app/stock-item-movements?stock_item_id=${PEEL}&type=used"
expect_value "one use" '[.data[].id] | join(",")' "${USED}"
expect 200 "a session's stock" GET "/app/stock-item-movements?patient_treatment_id=${SESSION}"
expect_value "the session's use" '[.data[].id] | join(",")' "${USED}"
expect 200 "by author" GET "/app/stock-item-movements?stock_item_id=${PEEL}&author_membership_id=$(fixture '.members.admin.membership_id')"
expect_value "the admin wrote none" '.data | length' 0
expect 400 "the Movements tab has no search" GET "/app/stock-item-movements?q=peel"
expect 200 "one movement" GET "/app/stock-items/${PEEL}/movements/${USED}"
expect 404 "another item's movement" GET "/app/stock-items/${GAUZE}/movements/${USED}"
expect 404 "a movement is never patched" PATCH "/app/stock-items/${PEEL}/movements/${USED}" '{"note":"x"}'
expect 404 "nor deleted" DELETE "/app/stock-items/${PEEL}/movements/${USED}?reason=mistake"
expect 400 "a revert without a reason" POST "/app/stock-items/${PEEL}/movements/${USED}/revert" '{}'
expect 400 "other needs a note" POST "/app/stock-items/${PEEL}/movements/${USED}/revert" '{"reason":"other"}'
expect_value "other: field" "${FIELDS}" body.note
expect 200 "revert the use (S8)" POST "/app/stock-items/${PEEL}/movements/${USED}/revert" '{"reason":"wrong_quantity"}'
REVERT="$(last '.data.id')"
expect_value "the revert: opposite, pointing at it" '[.data.type, .data.quantity_change, .data.quantity_after, .data.reverts_stock_item_movement_id, .data.revert_reason] | map(tostring) | join(",")' "reverted,1.5,4.5,${USED},wrong_quantity"
expect 200 "the use, reverted" GET "/app/stock-items/${PEEL}/movements/${USED}"
expect_value "reverted by" '.data.reverted_by_stock_item_movement_id' "${REVERT}"
expect 409 "revert it twice" POST "/app/stock-items/${PEEL}/movements/${USED}/revert" '{"reason":"mistake"}'
expect_value "twice: why" "${REASON}" already_reverted
expect 409 "revert a revert" POST "/app/stock-items/${PEEL}/movements/${REVERT}/revert" '{"reason":"mistake"}'
expect_value "a revert: why" "${REASON}" already_reverted
expect 200 "use 4 (0.5 left)" POST "/app/stock-items/${PEEL}/movements" "$(move "${PEEL}" used 4)"
expect 409 "reverting the opening would go below zero" POST "/app/stock-items/${PEEL}/movements/${OPENING}/revert" '{"reason":"mistake"}'
expect_value "below zero: why" "${REASON}" not_enough_stock
expect 404 "an item not here" GET /app/stock-items/sitm_000000000000000000000/movements

# ==== 9.C Stock counts (routes 13–15) =============================================================
expect 200 "count the peel and the gauze (S9)" POST /app/stock-counts \
  "$(jq -nc --arg peel "${PEEL}" --arg gauze "${GAUZE}" '{lines: [{stock_item_id: $peel, counted_quantity: 2}, {stock_item_id: $gauze, counted_quantity: 0}]}')"
COUNT="$(last '.data.id')"
expect_value "the count: lines, system quantities, one changed" '[(.data.id | startswith("scnt_")), (.data.lines | length), .data.changed_item_count, ([.data.lines[] | select(.stock_item_id == "'"${PEEL}"'") | .system_quantity, .counted_quantity, .difference] | map(tostring) | join("/")), (.data.author_membership_id != null)] | map(tostring) | join(",")' "true,2,1,0.5/2/1.5,true"
expect 200 "the peel after the count" GET "/app/stock-items/${PEEL}"
expect_value "counted to 2" '.data.quantity' 2
expect 200 "its newest movement" GET "/app/stock-items/${PEEL}/movements?limit=1"
expect_value "an adjust for the count, noted" '[.data[0].type, .data[0].quantity_change, .data[0].stock_count_id, .data[0].note] | map(tostring) | join(",")' "adjust,1.5,${COUNT},Stock check"
expect 400 "a count where nothing differs" POST /app/stock-counts "$(jq -nc --arg peel "${PEEL}" '{lines: [{stock_item_id: $peel, counted_quantity: 2}]}')"
expect_value "nothing differs: field" "${FIELDS}" lines
expect 400 "an unknown item" POST /app/stock-counts '{"lines":[{"stock_item_id":"sitm_000000000000000000000","counted_quantity":1}]}'
expect_value "unknown item: field" "${FIELDS}" lines
expect 400 "an item twice" POST /app/stock-counts \
  "$(jq -nc --arg peel "${PEEL}" '{lines: [{stock_item_id: $peel, counted_quantity: 1}, {stock_item_id: $peel, counted_quantity: 3}]}')"
expect_value "twice: field" "${FIELDS}" body.lines
expect 400 "no lines" POST /app/stock-counts '{"lines":[]}'
expect_value "empty: field" "${FIELDS}" body.lines
expect 400 "a negative count" POST /app/stock-counts "$(jq -nc --arg peel "${PEEL}" '{lines: [{stock_item_id: $peel, counted_quantity: -1}]}')"
expect 200 "past stock checks" GET "/app/stock-counts?limit=1"
expect_value "the newest is this one" '.data[0].id' "${COUNT}"
expect 200 "get the count" GET "/app/stock-counts/${COUNT}"
expect 404 "a count is never deleted" DELETE "/app/stock-counts/${COUNT}?reason=mistake"
expect 404 "nor changed" PATCH "/app/stock-counts/${COUNT}" '{"lines":[]}'
expect 404 "a count not here" GET /app/stock-counts/scnt_000000000000000000000

# ==== 9.D Stock purchases (routes 16–22) ==========================================================
expect 200 "a purchase: gauze and a new item (S10)" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" --arg bill "B-${S}" --arg cotton "Cotton ${S}" \
    '{stock_vendor_id: $vendor, bill_number: $bill, items: [{stock_item_id: $gauze, quantity: 10, rate: 12.5}, {new_item: {name: $cotton, unit: "roll"}, quantity: 3, rate: 40}]}')"
P1="$(last '.data.id')"
COTTON="$(last '.data.items[1].stock_item_id')"
expect_value "the bill from the lines, unpaid" '[(.data.id | startswith("spur_")), (.data.items | length), .data.items[0].amount, .data.items[1].amount, .data.bill_amount, .data.paid_amount, .data.due_amount, .data.payment_status, (.data.payment_ids | length)] | map(tostring) | join(",")' "true,2,125,120,245,0,245,unpaid,0"
expect 200 "the gauze received" GET "/app/stock-items/${GAUZE}"
expect_value "10 in, the latest rate" '[.data.quantity, .data.last_rate, .data.stock_level] | map(tostring) | join(",")' "10,12.5,ok"
expect 200 "the new item" GET "/app/stock-items/${COTTON}"
expect_value "added as typed, 3 rolls" '[.data.unit, .data.quantity, .data.last_rate] | map(tostring) | join(",")' "roll,3,40"
expect 200 "the gauze's receipt" GET "/app/stock-items/${GAUZE}/movements?type=received"
expect_value "points at the purchase" '.data[0].stock_purchase_id' "${P1}"
expect 200 "a purchase paid in part (S11)" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" --arg branch "${VESU}" \
    '{stock_vendor_id: $vendor, items: [{stock_item_id: $gauze, quantity: 4, rate: 50}], payment: {branch_id: $branch, splits: [{mode: "cash", amount: 100}], reference: "Counter"}}')"
P2="$(last '.data.id')"
expect_value "paid in part" '[.data.bill_amount, .data.paid_amount, .data.due_amount, .data.payment_status, (.data.payment_ids | length)] | map(tostring) | join(",")' "200,100,100,partial,1"
P2_PAYMENT="$(last '.data.payment_ids[0]')"
expect 200 "the supplier bill it recorded" GET "/app/payments/${P2_PAYMENT}"
expect_value "paid to the vendor, pointing at the purchase" '[.data.kind, .data.direction, .data.amount, .data.stock_purchase_id, .data.payee_name, .data.reference] | map(tostring) | join(",")' "supplier_bill,paid,100,${P2},Skin Supplies ${S},Counter"
expect 409 "Paid above the bill" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" --arg branch "${VESU}" \
    '{stock_vendor_id: $vendor, items: [{stock_item_id: $gauze, quantity: 1, rate: 10}], payment: {branch_id: $branch, splits: [{mode: "upi", amount: 50}]}}')"
expect_value "above the bill: why" "${REASON}" more_than_due
expect 400 "Paid from a branch not here" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" \
    '{stock_vendor_id: $vendor, items: [{stock_item_id: $gauze, quantity: 1, rate: 10}], payment: {branch_id: "brn_000000000000000000000", splits: [{mode: "upi", amount: 5}]}}')"
expect_value "branch: field" "${FIELDS}" payment.branch_id
expect 400 "an unknown item" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" '{stock_vendor_id: $vendor, items: [{stock_item_id: "sitm_000000000000000000000", quantity: 1, rate: 10}]}')"
expect_value "unknown item: field" "${FIELDS}" items
expect 400 "an item and a new item on one line" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" '{stock_vendor_id: $vendor, items: [{stock_item_id: $gauze, new_item: {name: "X"}, quantity: 1, rate: 10}]}')"
expect_value "both: field" "${FIELDS}" body.items/0
expect 400 "a quantity of 0" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" '{stock_vendor_id: $vendor, items: [{stock_item_id: $gauze, quantity: 0, rate: 10}]}')"
expect_value "0: field" "${FIELDS}" body.items/0/quantity
expect 400 "no lines" POST /app/stock-purchases "$(jq -nc --arg vendor "${VENDOR}" '{stock_vendor_id: $vendor, items: []}')"
expect_value "empty: field" "${FIELDS}" body.items
expect 400 "a purchase dated tomorrow" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" --arg date "${TOMORROW}" '{stock_vendor_id: $vendor, purchase_date: $date, items: [{stock_item_id: $gauze, quantity: 1, rate: 10}]}')"
expect_value "tomorrow: field" "${FIELDS}" purchase_date
expect 400 "an unknown vendor" POST /app/stock-purchases \
  "$(jq -nc --arg gauze "${GAUZE}" '{stock_vendor_id: "svnd_000000000000000000000", items: [{stock_item_id: $gauze, quantity: 1, rate: 10}]}')"
expect_value "unknown vendor: field" "${FIELDS}" stock_vendor_id
expect 409 "the lines are fixed (S10)" PATCH "/app/stock-purchases/${P1}" '{"items":[]}'
expect_value "fixed: why" "${REASON}" purchase_received
expect 400 "a bill under what is paid" PATCH "/app/stock-purchases/${P2}" '{"bill_amount":50}'
expect_value "under paid: field" "${FIELDS}" bill_amount
expect 200 "a bill of 250" PATCH "/app/stock-purchases/${P1}" '{"bill_amount":250,"bill_number":null}'
expect_value "the bill and its due" '[.data.bill_amount, .data.due_amount, .data.bill_number, (.data.items | length)] | map(tostring) | join(",")' "250,250,null,2"
expect 200 "the vendor's purchases" GET "/app/stock-purchases?stock_vendor_id=${VENDOR}"
expect_value "newest first, the footer's due" '[([.data[].id] | join("/")), .meta.due_total] | map(tostring) | join(",")' "${P2}/${P1},350"
expect 200 "by the vendor's name" GET "/app/stock-purchases?q=Skin%20Supplies%20${S}"
expect_value "both" '.data | length' 2
expect 200 "by the number" GET "/app/stock-purchases?q=%23$(last '.data[1].stock_purchase_number')"
expect_value "the number finds it" "[.data[].id | select(. == \"${P1}\")] | length" 1
expect 200 "partly paid" GET "/app/stock-purchases?stock_vendor_id=${VENDOR}&payment_status=partial"
expect_value "partial: the second, due 100" '[([.data[].id] | join("/")), .meta.due_total] | map(tostring) | join(",")' "${P2},100"
expect 200 "most due first" GET "/app/stock-purchases?stock_vendor_id=${VENDOR}&sort=due_amount&order=desc"
expect_value "the first purchase" '.data[0].id' "${P1}"
expect 200 "today's purchases" GET "/app/stock-purchases?stock_vendor_id=${VENDOR}&purchase_date_from=$(calendar_day 0)&purchase_date_to=$(calendar_day 0)"
expect_value "both today" '.data | length' 2
expect 200 "the purchases CSV" GET "/app/stock-purchases/exports?stock_vendor_id=${VENDOR}"
expect_value "CSV: name, rows" '[(.data.file_name | startswith("stock-purchases-")), .data.row_count] | map(tostring) | join(",")' "true,2"
expect 200 "the vendor owes" GET "/app/stock-vendors/${VENDOR}"
expect_value "payable: the open dues" '.data.payable' 350
expect 400 "a receipt cannot pay a purchase" POST /app/payments \
  "$(jq -nc --arg branch "${VESU}" --arg contact "${MEERA}" --arg purchase "${P1}" '{kind: "receipt", branch_id: $branch, contact_id: $contact, splits: [{mode: "cash", amount: 10}], stock_purchase_id: $purchase}')"
expect_value "receipt: field" "${FIELDS}" stock_purchase_id
expect 409 "a supplier bill over the due" POST /app/payments \
  "$(jq -nc --arg branch "${VESU}" --arg purchase "${P2}" '{kind: "supplier_bill", branch_id: $branch, payee_name: "Skin Supplies", splits: [{mode: "cash", amount: 150}], stock_purchase_id: $purchase}')"
expect_value "over the due: why" "${REASON}" more_than_due
expect 200 "pay the first purchase in full" POST /app/payments \
  "$(jq -nc --arg branch "${VESU}" --arg purchase "${P1}" '{kind: "supplier_bill", branch_id: $branch, payee_name: "Skin Supplies", splits: [{mode: "upi", amount: 250}], stock_purchase_id: $purchase}')"
P1_PAYMENT="$(last '.data.id')"
expect 200 "the first purchase, paid" GET "/app/stock-purchases/${P1}"
expect_value "paid in full" '[.data.paid_amount, .data.due_amount, .data.payment_status, (.data.payment_ids | join(","))] | map(tostring) | join(",")' "250,0,paid,${P1_PAYMENT}"
expect 200 "pay 200 of it instead (B20)" PATCH "/app/payments/${P1_PAYMENT}" '{"splits":[{"mode":"upi","amount":200}]}'
expect 200 "the purchase follows" GET "/app/stock-purchases/${P1}"
expect_value "paid 200, partial" '[.data.paid_amount, .data.payment_status] | map(tostring) | join(",")' "200,partial"
expect 409 "delete a paid purchase (S12)" DELETE "/app/stock-purchases/${P1}?reason=mistake"
expect_value "paid: why" "${REASON}" purchase_paid
expect 204 "delete its payment (open day)" DELETE "/app/payments/${P1_PAYMENT}?reason=mistake"
expect 200 "nothing paid again" GET "/app/stock-purchases/${P1}"
expect_value "unpaid" '[.data.paid_amount, .data.payment_status, (.data.payment_ids | length)] | map(tostring) | join(",")' "0,unpaid,0"
expect 200 "use 1 of the cotton" POST "/app/stock-items/${COTTON}/movements" "$(move "${COTTON}" used 1)"
expect 409 "delete it after some was used" DELETE "/app/stock-purchases/${P1}?reason=duplicate"
expect_value "used since: why" "${REASON}" not_enough_stock
expect 200 "receive 1 more by hand" POST "/app/stock-items/${COTTON}/movements" "$(move "${COTTON}" received 1)"
expect 204 "delete the first purchase" DELETE "/app/stock-purchases/${P1}?reason=duplicate"
expect 200 "its stock taken back" GET "/app/stock-items/${GAUZE}"
expect_value "gauze: 14 − 10" '.data.quantity' 4
expect 200 "the cotton too" GET "/app/stock-items/${COTTON}"
expect_value "cotton: 3 − 1 + 1 − 3" '.data.quantity' 0
expect 200 "the gauze's reverts" GET "/app/stock-items/${GAUZE}/movements?type=reverted"
expect_value "a revert of the receipt, for the purchase" '[.data[0].quantity_change, .data[0].stock_purchase_id, .data[0].revert_reason] | map(tostring) | join(",")' "-10,${P1},other"
expect 404 "the deleted purchase" GET "/app/stock-purchases/${P1}"
expect 200 "restore it — received again" POST "/app/stock-purchases/${P1}/restore"
expect 200 "the gauze back" GET "/app/stock-items/${GAUZE}"
expect_value "gauze: 14" '.data.quantity' 14
expect 409 "restore a live one" POST "/app/stock-purchases/${P1}/restore"
expect_value "live: why" "${REASON}" record_not_deleted
expect 404 "a purchase not here" GET /app/stock-purchases/spur_000000000000000000000

# ==== 9.E vendors, continued — delete with dues (routes 27–28) =====================================
expect 409 "delete a vendor who is owed (S13)" DELETE "/app/stock-vendors/${VENDOR}?reason=mistake"
expect_value "dues: why" "${REASON}" vendor_has_dues
expect 204 "delete the inline vendor" DELETE "/app/stock-vendors/${QUICK_VENDOR}?reason=duplicate"
expect 404 "gone" GET "/app/stock-vendors/${QUICK_VENDOR}"
expect 200 "restore it" POST "/app/stock-vendors/${QUICK_VENDOR}/restore"
expect 409 "restore it again" POST "/app/stock-vendors/${QUICK_VENDOR}/restore"
expect_value "live: why" "${REASON}" record_not_deleted
expect 204 "delete it once more" DELETE "/app/stock-vendors/${QUICK_VENDOR}?reason=not_needed"
expect 200 "its name taken meanwhile" POST /app/stock-vendors "$(jq -nc --arg name "Quick vendor ${S}" '{name: $name}')"
expect 409 "restore over the reused name" POST "/app/stock-vendors/${QUICK_VENDOR}/restore"
expect_value "reused: why" "${REASON}" record_restore_conflict

# ==== 9.A items, continued — delete at zero and restore (routes 6–7) ==============================
expect 400 "a delete without a reason" DELETE "/app/stock-items/${COTTON}"
expect 200 "write the cotton off" POST "/app/stock-items/${COTTON}/movements" "$(move "${COTTON}" damaged 3 '{"note":"Wet"}')"
expect 204 "delete the cotton at zero" DELETE "/app/stock-items/${COTTON}?reason=not_needed"
expect 404 "gone" GET "/app/stock-items/${COTTON}"
expect 200 "restore it" POST "/app/stock-items/${COTTON}/restore"
expect 409 "restore it again" POST "/app/stock-items/${COTTON}/restore"
expect_value "live: why" "${REASON}" record_not_deleted
expect 204 "delete it once more" DELETE "/app/stock-items/${COTTON}?reason=other&note=Old%20stock"
expect 200 "its name taken meanwhile" POST /app/stock-items "$(jq -nc --arg name "Cotton ${S}" '{name: $name}')"
expect 409 "restore over the reused name" POST "/app/stock-items/${COTTON}/restore"
expect_value "reused: why" "${REASON}" record_restore_conflict

# ==== Who may (S2) ================================================================================
as_role therapist
expect 200 "a therapist reads the items" GET "/app/stock-items?q=${S}"
expect 200 "a therapist uses stock" POST "/app/stock-items/${GAUZE}/movements" "$(move "${GAUZE}" used 1)"
expect 403 "a therapist has no export" GET /app/stock-items/exports
expect 403 "nor deletes" DELETE "/app/stock-items/${GAUZE}?reason=mistake"
as_role pharmacist
expect 200 "a pharmacist adds an item" POST /app/stock-items "$(jq -nc --arg name "Pharmacist item ${S}" '{name: $name}')"
expect 200 "a pharmacist records a purchase" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" '{stock_vendor_id: $vendor, items: [{stock_item_id: $gauze, quantity: 1, rate: 10}]}')"
expect 403 "but not its Paid — that is payment:create" POST /app/stock-purchases \
  "$(jq -nc --arg vendor "${VENDOR}" --arg gauze "${GAUZE}" --arg branch "${VESU}" '{stock_vendor_id: $vendor, items: [{stock_item_id: $gauze, quantity: 1, rate: 10}], payment: {branch_id: $branch, splits: [{mode: "cash", amount: 5}]}}')"
expect_value "Paid: why" "${REASON}" field_permission_required
expect 200 "a pharmacist counts" POST /app/stock-counts "$(jq -nc --arg gauze "${GAUZE}" '{lines: [{stock_item_id: $gauze, counted_quantity: 20}]}')"
as_role accountant
expect 200 "an accountant reads purchases" GET "/app/stock-purchases?stock_vendor_id=${VENDOR}"
expect 200 "and exports them" GET "/app/stock-purchases/exports?stock_vendor_id=${VENDOR}"
expect 200 "and the items" GET "/app/stock-items/exports?q=${S}"
expect 403 "but moves no stock" POST "/app/stock-items/${GAUZE}/movements" "$(move "${GAUZE}" used 1)"
expect 403 "nor adds a vendor" POST /app/stock-vendors "$(jq -nc --arg name "Accountant vendor ${S}" '{name: $name}')"
as_role doctor
expect 403 "a doctor has no stock" GET /app/stock-items
expect 403 "nor its movements" GET /app/stock-item-movements
as_role owner
