# Requirements — access

| Identifier | Requirement | Source |
| --- | --- | --- |
| `access.own-reports-only` | Only a signed-in person (a user principal — never an API key) files a report, for themselves, in a personal or team workspace. The table is FORCE row-level security with one owner policy (`USING` + `WITH CHECK` on `app.current_user_public_id`): nobody reads or writes another person's report through the app role | [BR7](../decisions.md), [BR8](../decisions.md) |
