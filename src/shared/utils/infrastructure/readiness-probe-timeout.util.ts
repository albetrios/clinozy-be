/**
 * Races {@link incomingPromise} against a timer. Used by `/readyz` so a slow
 * dependency does not wedge the readiness handler.
 *
 * @remarks
 * - **Algorithm:** `Promise.race` of the incoming promise and a rejecting timer; the timer is
 *   cleared once the race settles (D-7), so a fast probe leaves no pending timer behind.
 * - **Failure modes:** rejects with `health_ready_timeout:<label>` when the timer wins, or with the
 *   incoming promise's own rejection.
 * - **Side effects:** one `setTimeout`, always cleared.
 */
export async function readinessProbeTimeout<T>({
  incomingPromise,
  timeoutMilliseconds,
  probeLabelForErrors,
}: {
  incomingPromise: Promise<T>;
  timeoutMilliseconds: number;
  probeLabelForErrors: string;
}): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      incomingPromise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`health_ready_timeout:${probeLabelForErrors}`));
        }, timeoutMilliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
