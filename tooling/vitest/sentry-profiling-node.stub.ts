/**
 * Stand-in for `@sentry/profiling-node` in Stryker's test run — aliased in `./stryker.config.ts`.
 *
 * @remarks
 * The real package loads Sentry's native CPU-profiler addon on import, so every test worker that
 * imports `src/infrastructure/observability/sentry/sentry.ts` loads it. Stryker's vitest runner
 * forces the `threads` pool: when the pool tears its worker threads down at the end of the run,
 * the addon is unloaded while a callback into it is still queued on the main event loop, and the
 * long-lived Stryker child dies with SIGSEGV (main thread, `uv_run` → unmapped address). No test
 * exercises profiling — `initSentry` only installs the integration with a DSN and a profile
 * sample rate — so a no-op integration is enough.
 */
export function nodeProfilingIntegration(): { name: string } {
  return { name: 'ProfilingIntegration' };
}
