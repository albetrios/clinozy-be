/** Types for early-failure-alert.mjs — the PR CI early failure alert (see that file). */

/** The fields of a workflow-run job the alert reads (GitHub REST `GET .../runs/{id}/jobs`). */
export interface RunJob {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly html_url: string;
}

/** A commit status body (GitHub REST `POST /repos/{owner}/{repo}/statuses/{sha}`). */
export interface CommitStatus {
  readonly state: 'failure' | 'success';
  readonly context: string;
  readonly description: string;
  readonly target_url: string;
}

/** The status context the alert posts under. */
export const ALERT_CONTEXT: string;

/** Job names that never count as lanes: the watcher itself and `Quality gate`. */
export const NOT_LANES: ReadonlySet<string>;

/** The first lane of the run that failed or timed out, or null. */
export function findFailedLane(jobs: readonly RunJob[]): RunJob | null;

/** Whether every lane has finished. */
export function lanesFinished(jobs: readonly RunJob[]): boolean;

/** The commit status the alert posts for a failed lane. */
export function alertStatus(lane: RunJob): CommitStatus;

/** One entry of a commit's combined status (GitHub REST `GET .../commits/{ref}/status`). */
export interface ContextStatus {
  readonly context: string;
  readonly state: string;
}

/** Whether the head commit's alert is red (the combined status lists each context's latest). */
export function alertIsRed(statuses: readonly ContextStatus[]): boolean;

/** The run a cleared alert names: its attempt number and its URL. */
export interface ClearingRun {
  readonly runAttempt: string;
  readonly runUrl: string;
}

/** The commit status that turns a stale alert green once every lane of a later attempt passed. */
export function clearedStatus(run: ClearingRun): CommitStatus;
