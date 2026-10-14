# Requirements — quality

| Identifier | Requirement | Source |
| --- | --- | --- |
| `quality.identity-from-session` | The reporter's id, name and email come from the verified session's account — never from the request body, which refuses `user_id`, `name` and `email` | [BR4](../decisions.md) |
| `quality.errors-translated` | Every validation message is a translation key, in English and Spanish | `CLAUDE.md` › i18n |
| `quality.bounded` | `STRICT_AUTHED_RATE_LIMIT` (10 a minute per person) and the column bounds stop a stuck client from flooding the table | [BR7](../decisions.md) |
