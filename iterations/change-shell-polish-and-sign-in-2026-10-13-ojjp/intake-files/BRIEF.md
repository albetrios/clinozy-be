# Brief — steady room switches, soft picked badges, and a sign-in screen that sells the product

## What changes

1. **Room switch without a flicker (`shell`, every room).** Moving between rooms — the header's
   pinned tabs, the phone tab bar, All sections, the 1–9 shortcuts — must not flash a scrollbar on
   the right edge of the screen. Today the page's 6px rise on entry pushes a room that exactly fills
   the screen 6px past it, so the scrollbar appears for a moment and disappears again. The rise
   stays; it may no longer make the page scrollable.
2. **Tabs keep their place (`shell`, room tab rows).** Switching tabs must not move any other tab or
   the search field. Today the current tab is drawn bolder than the rest, so it grows by up to 2px
   and pushes every tab after it (the header's pinned tabs; the phone tab bar's labels; the tab rows
   that switch weight — the chat composer's "Send via" and the patient file bar). Each tab keeps the
   width of its bolder self, picked or not.
3. **Soft picked badges (every room).** A picked or current coloured badge — a chip in a drawer or
   in Filters, the Today lane tile, a reason chip, a feedback type, a picked avatar, a patient-file
   section tile, a fresh clinical chip — is outlined today in its tone's ink, which reads as a black
   (in dark mode, white) border. It becomes a soft, same-hue treatment: a 1.5px edge in a mid shade of
   the badge's own colour (its ink mixed with its dot colour) and a 3px halo in its dot colour at low
   strength. Hover previews the edge without the halo. Untoned chips ("Any") use the stone tone the
   same way. Fills, inks and every unpicked badge stay as they are.
4. **A new sign-in screen (`/login`, and the MFA and sign-in hand-off screens that share its
   frame).** The plain card on an empty canvas becomes a split screen that tells a first-time visitor
   what Clinozy is while a returning member signs in:
   - **Hero** — eyebrow "For skin, hair & aesthetic clinics", headline "Your whole clinic, calm in
     one place.", and one line on what it replaces (WhatsApp threads, paper registers, spreadsheets).
   - **The sign-in card** — unchanged in behaviour and content.
   - **A living showcase** — one patient's journey through the clinic's rooms (Enquiry · Booked ·
     Waiting · With doctor · Treatment · Checkout · Follow-up), each stop in its room's tone, lighting
     up one after the other; three small "moments" (an arrival, a follow-up set, an invoice settled);
     three value lines (every room in step · nothing slips through · colour-coded and calm); and a
     privacy line.
   - From `lg` the hero and the showcase fill the start column on a soft tonal canvas and the card
     sits in the end column; below `lg` the hero comes first, then the card, then the showcase.

## Why

- The flicker and the tab shift make every room switch feel unstable — the most frequent action in
  the app.
- The ink outline on picked badges is the heaviest line on screen; it reads as an error state rather
  than a pick and fights the pastel palette. Current practice for tinted badges (Tailwind UI, Tremor,
  Force design system) is a same-hue edge, not a dark one.
- The sign-in screen is the first thing a clinic owner or a new hire sees, and today it says nothing
  about the product.

## Affected screens, entities and routes

- Screens: shell (header pinned tabs, phone tab bar, the routed page's entry motion, the signed-out
  sign-in surface), today (lane tiles), leads, patients, appointments, payments, tasks, offerings,
  users, medical, clinic-stock (Filters chips and drawer chips), patient-file (section tiles, file
  bar, feedback types, clinical chips)
- Entities: none
- Routes: none — no API route is added, changed or removed; `/login` keeps its URL

## Rules

- No API, data or background change; the sign-in flow, its methods, its test ids and its error
  handling stay exactly as they are.
- Every new string is a translation key, in every shipped locale.
- Semantic tokens only; the new edge colour is a token derived from each tone's own ink and dot, so
  light, dark and every preset follow it.
- Motion respects reduced motion: the showcase is still with every stop shown.
- The phone keeps the sign-in card above the fold at 375 × 667.
- No invented numbers, customers or testimonials in the marketing copy.

## Acceptance criteria

- [ ] Switching rooms by every route (pinned tab, phone tab, All sections, shortcut) never makes the
      room's frame scrollable during the entry animation, at 1440 × 900 and 390 × 844.
- [ ] The rise still plays on a room change and does not replay when a drawer opens over a room.
- [ ] Switching the current tab moves no other header tab and does not resize the search field (every
      tab's left edge identical before and after, to the pixel).
- [ ] The phone tab bar's labels keep their width when the current tab changes.
- [ ] The tab rows that switch weight (composer "Send via", patient file bar) keep every tab's width.
- [ ] No picked or current coloured badge is outlined in its ink: its edge is the tone's edge colour,
      light and dark, in Filters, drawer chips, Today lane tiles, reason chips, feedback types, picked
      avatars, patient-file section tiles and fresh clinical chips.
- [ ] Picked state is still announced (`aria-pressed`, `aria-checked`, `aria-current`) and its edge
      keeps at least 3:1 against the page.
- [ ] `/login` shows the hero, the card and the showcase from `lg` side by side, and below `lg` in the
      order hero → card → showcase, with the card above the fold at 375 × 667.
- [ ] Every new string exists in all shipped locales; the sign-in flow's tests pass unchanged.
- [ ] With reduced motion the showcase does not animate.
- [ ] The frontend's static gates, unit tests and bundle budgets pass; the backend's gates pass.

## Out of scope

- Any backend route, table, job, seed or permission change.
- The sign-in methods themselves (email code, passkey, OAuth, MFA) and their copy inside the card.
- The other signed-out pages (organization picker, onboarding, invitations) — they keep the plain
  frame.
- The room tab track's segments (they do not change weight) and the Today/Mine segmented toggles.
- Quick-fill chips (dashed by design, not a picked state).
