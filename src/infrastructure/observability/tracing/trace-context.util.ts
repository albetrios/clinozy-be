import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { OTEL_TRACER_NAME } from '@/shared/constants/project-identity.constants.js';
import { sanitizeDatabaseError } from '@/shared/utils/security/sensitive-redaction.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';

/** W3C trace context fields stored on BullMQ job payloads for cross-process propagation. */
export interface TraceContextCarrier {
  traceparent?: string | undefined;
  tracestate?: string | undefined;
}

/**
 * Captures the active span's trace context for injection into BullMQ job data.
 * Returns an empty object when no span is active.
 */
export function captureTraceContextForPropagation(): TraceContextCarrier {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return omitUndefined({
    traceparent: carrier.traceparent,
    tracestate: carrier.tracestate,
  });
}

/**
 * Runs work as a consumer span linked to a propagated parent (e.g. mail worker).
 * When `traceparent` is absent, runs the callback without creating a span.
 */
export async function runWithPropagatedTraceContext<T>({
  carrier,
  spanName,
  callback,
}: {
  carrier: TraceContextCarrier;
  spanName: string;
  callback: () => T | Promise<T>;
}): Promise<T> {
  if (!carrier.traceparent) {
    return callback();
  }

  const extractionCarrier: Record<string, string> = {
    traceparent: carrier.traceparent,
  };
  if (carrier.tracestate) {
    extractionCarrier.tracestate = carrier.tracestate;
  }

  const extractedContext = propagation.extract(ROOT_CONTEXT, extractionCarrier);
  const tracer = trace.getTracer(OTEL_TRACER_NAME);

  return context.with(extractedContext, () =>
    tracer.startActiveSpan(spanName, { kind: SpanKind.CONSUMER }, async (span) => {
      try {
        const result = await callback();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        // A database error's message carries its SQL and bound values (patient data); the span
        // and its exception event leave the process, so they get the sanitized form (C-1). The
        // caller still receives the original error.
        const recorded = sanitizeDatabaseError(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: recorded instanceof Error ? recorded.message : String(recorded),
        });
        span.recordException(recorded instanceof Error ? recorded : new Error(String(recorded)));
        throw error;
      } finally {
        span.end();
      }
    }),
  );
}
