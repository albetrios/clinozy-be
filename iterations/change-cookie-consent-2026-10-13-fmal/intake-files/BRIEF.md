# Brief — Cookie consent the claude.com way: one "Cookie settings" card, kept per browser

<!--
Written 2026-10-13 from the user's request ("design a cookie popup same from claude.com and follow
all patterns from there only adapt in ours … when we click on logout it shows again — follow what
claude.com is following"). The claude.com reference was read from its public site bundle the same
day: the `ConsentContainer` / `ConsentBanner` components, their stylesheet, and the cookie helpers.
-->

## What changes

The analytics consent card is a platform surface (it sits over every screen until answered — no
Slug of its own). It is rebuilt on claude.com's cookie banner, adapted to Clinozy:

1. **The card — claude.com's anatomy.** Title "Cookie settings"; one paragraph saying what cookies
   do here and that analytics runs only if the person agrees, with a link to the Privacy Policy;
   three buttons — "Customize cookie settings", "Reject all cookies", "Accept all cookies" (on a
   phone: "Customize", "Reject", "Accept", all three in one row; from a tablet up: Customize on its
   own row, Reject and Accept side by side under it). Accept is the primary button; Reject is the
   same size as Accept. There is no close (×) button.
2. **Customize — the same card, not a new popup.** It swaps the card's body to a longer paragraph
   and one row per category: **Necessary** — "Enables security and basic functionality." —
   `Required`, always on; **Analytics** — product analytics and session recordings — `On` / `Off`
   switch, starting from the current answer. One full-width "Save preferences" button stores them.
3. **Keyboard.** Escape with focus inside the card rejects all (claude.com: Escape rejects). The
   card is non-modal — the page under it stays usable, nothing is trapped.
4. **Where the answer lives — this browser.** One first-party cookie holding the answer per
   category, kept 12 months (claude.com: `anthropic-consent-preferences`, `{analytics, marketing}`,
   `max-age` one year, `path=/`, `SameSite=Lax`, `Secure`). Clinozy's carries the answer, the
   consent policy version it answered and when.
5. **Signing out never asks again.** The answer belongs to the browser, as on claude.com: signing
   out does not forget it, and signing in does not replace it with an answer stored on the account.
6. **Privacy choices.** claude.com's footer has a "Privacy choices" button that reopens the card.
   Clinozy: the signed-out frame (sign-in, MFA, invitation, onboarding) gets a footer with "Privacy
   choices"; signed in, Settings › Account › Privacy shows the same categories (Necessary
   `Required`, Analytics switch) and saves at once.
7. **Global Privacy Control.** A browser that sends GPC gets every optional category off and is
   never asked (claude.com: GPC → reject all, no banner). Its Analytics switch shows off and locked,
   with a one-line note.
8. **A refused category is cleaned up.** claude.com deletes each refused category's cookies;
   Clinozy removes PostHog's stored identifiers (`ph_*` cookies and storage).
9. **The account keeps a receipt.** An answer given while signed in is still sent to the account
   with the policy version it answers (clinozy-be D85: the decision, the version, the time and an
   audit row — the proof of consent). It is written, never read back to drive the card.

## Why

- Today the card comes back after every sign-out: the answer is kept per account and forgotten
  when a session ends (clinozy-fe D161, clinozy-be D85). On a clinic computer that several people
  sign in and out of all day, everyone is asked again and again.
- claude.com's model is one browser, one answer — asked once, again only when it expires or the
  policy changes — with a real "Customize" step and an easy way back ("Privacy choices").

## Affected screens, entities and routes

- Screens: none of `_index.md`'s Slugs — platform surfaces only: the consent card (mounted on the
  root, over every screen), the signed-out frame (`shell.md`'s signed-out state), Settings ›
  Account › Privacy.
- Entities: none in `schema-routes.md` (the receipt is the platform's user settings record,
  clinozy-be D85).
- Routes: none in `schema-routes.md`. The platform's own `PATCH /api/v1/users/me/settings` keeps
  taking the receipt unchanged; `GET /api/v1/users/me/settings` is no longer read for consent.

## Rules

- Nothing optional runs before a yes: product analytics (and its web-vitals), session recordings
  and profiling start only while Analytics is on. Error reports run under legitimate interest,
  as today.
- The card shows while this browser has no standing answer: none yet, one older than 12 months
  (the cookie expires), or one to an older consent policy version. The policy version moves to 2
  with this notice, so every browser is asked once more; the old browser-storage answer is removed.
- Everyone is asked, wherever they are (claude.com asks only in countries that require explicit
  consent; Clinozy asks every visitor — DPDP Act and GDPR, clinic software).
- Reject is never harder than Accept: the same size, on the first view, never behind Customize.
- Escape inside the card is Reject all; nothing else closes the card without an answer.
- GPC is Reject all; the card is not shown on its own and Analytics cannot be switched on while
  the browser sends GPC.
- Signed in, every new answer is sent to the account with the policy version; signed out, nothing
  is sent. Sign-in and sign-out never change this browser's answer.
- Another open tab follows a new answer when the person returns to it.
- Placement: the bottom-START corner (the feedback trigger owns bottom-END), above the phone's tab
  bar; at most 456px wide (claude.com's width); a full-width inset sheet on a phone; mirrored under
  right-to-left.
- Every string is a translation key, in every shipped language.

## Acceptance criteria

- [ ] A first visit shows "Cookie settings" with Customize, Reject and Accept, and nothing optional has started.
- [ ] Accept all closes the card, turns Analytics on and starts product analytics; a reload does not ask again.
- [ ] Reject all closes the card and leaves Analytics off with no `ph_*` identifiers stored; a reload does not ask again.
- [ ] Customize shows, in the same card, Necessary (Required, locked on) and Analytics (On/Off from the current answer); Save preferences stores exactly the switches.
- [ ] Escape with focus inside the card rejects all.
- [ ] Signing out does not bring the card back; signing in as someone else keeps this browser's answer.
- [ ] "Privacy choices" on the signed-out frame reopens the card with the current answer.
- [ ] Settings › Account › Privacy shows Necessary (Required) and Analytics (switch); a change applies at once.
- [ ] A browser sending GPC is never asked; Analytics shows off and locked, with the note.
- [ ] Signed in, an answer is sent to the account with the policy version and the backend audits it; signed out, no request is sent.
- [ ] An answer older than 12 months, or to policy version 1, asks again.
- [ ] Phone: the three buttons sit in one row with short labels, no horizontal scroll, the card clear of the tab bar. Desktop: at most 456px wide in the bottom-start corner; it mirrors under right-to-left.
- [ ] Backend: signing out leaves the account's consent receipt as it was; the documented fields describe a receipt, not the browser's answer.

## Out of scope

- A Marketing category — Clinozy runs no advertising or marketing trackers, so there is nothing to switch.
- Asking only in some countries (claude.com's region check).
- A consent log for signed-out visitors (no account to keep it on).
- A separate Cookie Policy page — the Privacy Policy link is reused.
- Any change to the backend's settings API shape or database.
