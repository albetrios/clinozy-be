# Requirements — operations

| Identifier | Requirement | Source |
| --- | --- | --- |
| `operations.file-report` | `POST /api/v1/users/me/bug-reports` stores the report and answers `200` with it (`id`, `description`, `input_method`, `page_path`, `app_version`, `user_id`, `reporter_name`, `organization_id`, `created_at`); `400` for a missing, blank or too-long description, an unknown `input_method`, a bad `page_path`, or any extra field; `401` signed out or with an API key; `429` past the per-person cap | [BR6](../decisions.md), [BR7](../decisions.md) |
| `operations.export-reports` | The person's data export carries their reports (`bug_reports`: description, input method, page, version, time), capped like every other category | [BR11](../decisions.md) |
