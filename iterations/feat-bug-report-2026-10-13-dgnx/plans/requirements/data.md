# Requirements — data

| Identifier | Requirement | Source |
| --- | --- | --- |
| `data.bug-report` | One row per report in `auth.user_bug_reports`: public id (`bug_…`), the reporter (`user_id` FK, `reporter_name` nullable, `reporter_email`), `description` (1–5000 characters, never blank), `input_method` (`typed` · `voice` · `mixed`), optional `page_path` (≤ 2048, starts `/`) and `app_version` (≤ 64), the workspace snapshot `organization_public_id` (nullable, no FK), `user_agent` (≤ 512) and `created_at`. Reports are append-only: no update or delete route. A report goes with its account (`ON DELETE CASCADE`) | [BR4](../decisions.md) – [BR6](../decisions.md), [BR10](../decisions.md) |
