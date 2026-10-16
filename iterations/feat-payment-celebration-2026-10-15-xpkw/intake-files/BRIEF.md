# Brief — A payment received is a moment: it celebrates, then asks for a review; and every drawer and section moves the same way

## What changes

### A. Payment received

1. **The Receive payment drawer celebrates.** Saving a new receipt — from the Payments ledger,
   ⌘K "New receipt", the patient file (Add → Payment, the rail's Collect, the bento's "Collect
   payment", an invoice row's "Record payment") and the visit flow's Collect (Today › Checkout) —
   no longer closes the drawer behind a toast. The drawer turns into a **Payment received** view:
   an animation plays once (a ring draws, a check draws in, a few sparks burst — about one
   second), then the amount, "received from <name>", the modes, the receipt number and what it did
   to the invoice ("Invoice #785 paid in full" or "₹1,200 still due"), and a **Done** button that
   closes the drawer the way Save closed it before. Editing a receipt keeps today's toast and
   close.
2. **The same view after every patient payment taken in a drawer:** a new clinic or consultation
   invoice saved with "Paid now", and "Got it back" on a pending credit (money a patient returns).
3. **The animation** is an original Lottie animation drawn for Clinozy (LottieFiles' format,
   authored here — the LottieFiles site is not reachable from this build), played by lottie-web's
   light SVG player. It takes its colours from the theme (light, dark, every preset), loads only
   when a drawer that can take a payment opens (never on first paint), plays once per receipt and,
   with reduced motion, shows its last frame at once. Nothing waits for it: the view's text and
   buttons are there from the first frame and Done works at once.

### B. The review ask

4. **For a patient** (a payer with a patient file), the view shows their reviews:
   - **Not reviewed on Google yet:** "Ask <first> for a Google review" with two actions —
     **Send on WhatsApp** queues the clinic's Review message ("Thank you for visiting us, <first>!
     … <review link>") in the patient's WhatsApp chat with the payment branch's Google review link,
     then reads "Queued in <first>'s chat"; **Log a review** opens the patient file's review drawer
     for a review given at the desk.
   - **Already reviewed on Google:** a thank-you line ("Reviewed on Google · 5★ · 3 Oct") in
     place of the ask.
   - **Previous reviews:** the three most recent (stars, source, date, the first line of text, a
     "needs a call" chip on a low one) and "All N reviews", which opens the patient file's
     feedback.
5. **The branch's Google review link.** The Branch drawer (Users › Branches) gains a "Google review
   link" field (https only), saved through the branch API that already stores it. Every member
   reads it with their branches (`GET /app/branches/my` returns `review_link` — the backend
   change), so the chat composer's Review template fills it too (today it is empty). With no link
   on the branch, Send on WhatsApp is off and says so — with a way to the Branch drawer for those
   who can edit branches.

### C. Every drawer and section moves the same way

6. **Bottom sheets** (All sections on a phone, a confirm on a phone, every picker sheet) open like
   the picker sheet already does — rise 28px and fade in 260ms on the sheet curve, their scrim
   with them, no exit animation — set once in the shared primitive instead of vaul's own 500ms
   slide.
7. **A room's own header stays still.** Moving between the sections of the patient file (Overview,
   Clinical notes, Visits, Prescriptions, Treatments, Photos, Reports, Invoices, Payments,
   Packages, Team notes) and between the routed tabs of any room whose header stays on screen no
   longer replays the page rise over the unchanged header and rail: only the part that changed
   rises.
8. **Smooth scrolling only with motion allowed:** the feedback carousel and "reveal in the list"
   jump at once under reduced motion.
9. **One switch:** custom toggles (the role switch card, drawer choice controls) move their thumb
   like the shared switch — 200ms on the strong ease-in-out — and no caller retimes the shared
   switch.
10. **One progress bar:** the setup guide and the setup steps drawer use the progress primitive's
    own transition.
11. **The cookie banner** rises on the strong ease-out in 240ms (it was 300ms on `ease`).
12. **Every record drawer** is checked against the system — 340ms in on the sheet curve, its scrim
    with it, no exit — and any that differs is brought in line.

## Why

Taking a payment is the end of a good visit, and the best moment to ask for a review — but today
it ends in a toast that vanishes, and the review ask lives in a task two days later. A short,
well-made celebration makes the moment feel finished; putting the patient's reviews and a one-tap
ask in the same view turns it into reviews for the clinic. The motion pass carries the app's one
motion language (`change-motion-consistency`) into every drawer and section, so nothing a person
opens moves differently from the rest.

## Affected screens, entities and routes

- Screens: payments (Receive payment drawer), invoices (Invoice drawer, "Paid now"), payments ›
  pending (Settle credit drawer), patient file (every section; Clinical notes feedback; the review
  drawer), users › branches (Branch drawer), the chat composer's Review template, All sections
  (phone), confirm (phone), picker sheets, setup guide and setup steps drawer, cookie banner,
  roles (role switch card)
- Entities: Branch (`review_link` read by every member), Payment, Invoice, Pending credit,
  Patient review, Contact activity (message)
- Routes: `GET /app/branches/my` (gains `review_link`); `PATCH /app/branches/{branch_id}`
  (`review_link`, existing); `GET /app/patients/{patient_id}/reviews`;
  `POST /app/contacts/{contact_id}/activities/send-message`; `POST /app/payments`;
  `POST /app/invoices`; `POST /app/pending-credits/{pending_credit_id}/settle` — no new route

## Rules

- The view follows a **new** payment taken **from** someone: a receipt, an invoice paid now, a
  credit got back. Edits, money back, expenses and supplier bills keep their toast.
- The review part shows only for a payer with a patient file, to a member who can read the patient
  (`patient:read`). **Log a review** needs `patient_review:create`; **Send on WhatsApp** needs the
  right to message the contact and a review link on the payment's branch.
- "Reviewed on Google" = the patient has a review with source `google` (not removed).
- A message is **queued** in the patient's chat (clinozy-be's outbox; delivery is a separate
  service): the copy says queued, never sent. Sending twice in one view is not possible.
- Motion: the animation runs ≤ 1.2s and the check is drawn by 0.7s; it never blocks input; it
  never replays on a re-render; reduced motion → its last frame. The view's entrance is the
  drawer body's crossfade (strong ease-out, under 300ms).
- No `eval` (the CSP has no `unsafe-eval`): the light player, without expressions. The player and
  the animation are loaded with a dynamic import; first paint does not grow.
- `review_link` on `/app/branches/my` is additive — same major version, no route added.
- Every new string is translated in every locale the app ships.

## Acceptance criteria

- [ ] Saving a new receipt shows the Payment received view with the animation, amount, payer,
      modes, receipt number and invoice outcome; Done closes the drawer where Save used to.
- [ ] The same view follows an invoice saved with "Paid now" and a credit got back; edits keep
      their toast.
- [ ] The animation is a Lottie JSON played by lottie-web's light player, loaded on demand,
      themed by tokens, once per payment, last frame under reduced motion; Initial JS and CSS do
      not grow beyond their budgets.
- [ ] For a patient without a Google review the view offers Send on WhatsApp and Log a review;
      with one it thanks them; up to three previous reviews show, with "All N reviews".
- [ ] Send on WhatsApp queues the Review message with the branch's review link in the patient's
      chat and reads "Queued in <first>'s chat"; with no link it is off and says why.
- [ ] The Branch drawer edits the Google review link; `GET /app/branches/my` returns
      `review_link`; the chat's Review template fills it.
- [ ] Bottom sheets open in 260ms on the sheet curve with no exit, from the shared primitive.
- [ ] Switching patient-file sections and routed room tabs rises only the content that changed.
- [ ] Smooth scrolls respect reduced motion; custom toggles match the switch; one progress
      transition; the cookie banner rises in 240ms on the strong ease-out.
- [ ] Every record drawer opens the same way (340ms on the sheet curve, no exit), proven by a tour
      of every drawer in the running app.

## Out of scope

- Recording that a review was asked for (no backend record; the queued message in the chat is the
  trace) and delivering WhatsApp messages (the messaging service).
- The medical sale's one-click Collect from a list row (it stays a toast), Send payment and Day
  close.
- Drawer exit animations (still none), new review sources, review analytics.
