Status: ready
Kind: flow
Depends on: none

## Stories

- As a clinic team member I want my cookie answer to stay on this computer when I sign out so that
  I am not asked again every time someone signs in.
- As the clinic (the business) I want a record of every analytics answer given while signed in so
  that I can prove consent when asked.

## Rules

- The browser's answer decides what runs; the backend never reads or clears it (`quality.no-server-consent-cookie`).
- Signed in, a new answer is recorded with its policy version and audited (`operations.record-receipt`, `quality.proof-of-consent`).
- The receipt is returned with the settings and read by nothing for the card (`operations.read-receipt`, `data.consent-receipt`).
- Signing out leaves the receipt (`operations.sign-out-keeps-receipt`); only the owner reads or writes it (`access.own-settings-only`).

## Acceptance criteria

- Signing out leaves the account's consent receipt as it was — `intake-files/BRIEF.md:100`
- The sign-out response clears no site data and sets no consent cookie — `intake-files/BRIEF.md:31`
- Signed in, an answer is recorded with the policy version and audited — `intake-files/BRIEF.md:97`
- The documented fields describe a receipt, not the browser's answer — `intake-files/BRIEF.md:100`

## Work items

- `data.consent-receipt`, `operations.record-receipt`, `operations.read-receipt`,
  `operations.sign-out-keeps-receipt`, `access.own-settings-only`, `quality.proof-of-consent`,
  `quality.receipt-errors-translated`, `quality.no-server-consent-cookie`
