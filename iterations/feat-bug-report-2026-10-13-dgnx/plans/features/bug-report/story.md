# Feature story — bug-report

**As** anyone signed in to Clinozy, **I want** to tell the team about a bug in a sentence — typed or
spoken — **so that** it reaches them with who I am and where I was, without filling in my own name
and email.

| Field | Meaning | Source |
| --- | --- | --- |
| `description` | what went wrong and what the person expected; 1–5000 characters after trimming | the request ("textbox or voice") |
| `input_method` | `typed`, `voice` (dictated only) or `mixed` (dictated, then edited) | the request ("voice icon") |
| `page_path` | the in-app path the person was on, without query or fragment | triage |
| `app_version` | the frontend release the person ran | triage |
| `user_id` · `reporter_name` · `reporter_email` | the signed-in person, from the session ([BR4](../../decisions.md), [BR5](../../decisions.md)) | the request ("logged in user name, user-id … store it in backend") |
| `organization_public_id` | the workspace from the token's `org` claim, `null` in none | triage |
| `user_agent` | the browser, from the `User-Agent` header | triage |

**Flow.** Signed in → the frontend sends `POST /api/v1/users/me/bug-reports` with the description
and context → the service reads the person's account in the same unit of work, stamps their id,
name and email, and inserts the row under their own row-level-security context → `200` with the
stored report. Nothing else is set off ([BR9](../../decisions.md)).
