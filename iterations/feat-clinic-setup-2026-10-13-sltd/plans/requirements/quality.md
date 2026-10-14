# Quality — feat-clinic-setup-2026-10-13-sltd

| Id | Requirement | Kind | Source |
| --- | --- | --- | --- |
| `quality.safe-to-repeat` | Every setup write can be repeated without effect: going live twice, answering a step twice, skipping twice; `POST …/complete` carries `X-Idempotency-Key`. | NEW | BRIEF.md:233–234; OS5, OS6 |
| `quality.no-lost-answers` | Two managers changing the setup at the same time never lose each other's changes (single-statement merges). | NEW | OS5 |
| `quality.tenant-isolation` | Setup reads and writes only the active organization's rows, under the settings table's forced row-level security; the member pointer stays inside the organization. | NEW | routes-final §2.A.3; K8 |
| `quality.status-read-cost` | The status read runs a fixed handful of small existence / count reads on existing indexes — no list is loaded. | NEW | OS3 |
| `quality.errors-translated` | Every new error reason has an English and a Spanish message. | NEW | OSC5 |

## Before → after

none — every requirement here is NEW.
