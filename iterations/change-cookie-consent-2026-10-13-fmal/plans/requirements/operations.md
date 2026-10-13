# Operations

- `operations.record-receipt` — **EXISTING (unchanged behavior).** Signed in, a person's new
  analytics answer is recorded on their settings with the policy version it answers; a decision
  without its version (or the reverse) is refused, naming the version field. Signed out, nothing
  is recorded. Source: `BRIEF.md:42–44`, `:78–79`, `:97`.
- `operations.read-receipt` — **CHANGED.** The person's settings still return the receipt; the
  frontend no longer reads it to decide whether to ask. Source: `BRIEF.md:61–62`.
- `operations.sign-out-keeps-receipt` — **NEW (pinned).** Signing out ends the session and nothing
  else: the receipt stays as it was, and the sign-out response neither clears site data nor sets a
  consent cookie. Source: `BRIEF.md:31–32`, `:100`.

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `operations.read-receipt` | read by the frontend at every sign-in; the later of the account's and the browser's answers won | returned as before, read by nothing for the card | CC1, CC3 |
