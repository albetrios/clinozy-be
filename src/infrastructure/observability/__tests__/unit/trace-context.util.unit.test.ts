import { trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureTraceContextForPropagation,
  runWithPropagatedTraceContext,
} from '@/infrastructure/observability/tracing/trace-context.util.js';

describe('runWithPropagatedTraceContext — error + tracestate branches', () => {
  let spanExporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    spanExporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
    });
    provider.register({ propagator: new W3CTraceContextPropagator() });
  });

  afterEach(async () => {
    await provider.shutdown();
    trace.disable();
  });

  it('records the exception and ends the span when the callback throws, then rethrows', async () => {
    const tracer = trace.getTracer('test');
    const boom = new Error('callback failed');

    await tracer.startActiveSpan('http.request', async (parentSpan) => {
      const carrier = captureTraceContextForPropagation();
      await expect(
        runWithPropagatedTraceContext(carrier, 'worker.failing-job', async () => {
          throw boom;
        }),
      ).rejects.toThrow('callback failed');
      parentSpan.end();
    });

    const workerSpan = spanExporter
      .getFinishedSpans()
      .find((span) => span.name === 'worker.failing-job');
    expect(workerSpan).toBeDefined();
    // status code 2 === SpanStatusCode.ERROR; span was ended (it appears in finished spans)
    expect(workerSpan?.status.code).toBe(2);
    expect(workerSpan?.events.some((event) => event.name === 'exception')).toBe(true);
  });

  it('propagates tracestate through the carrier when present', async () => {
    const carrier = {
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'vendor=opaque-value',
    };
    let sawActiveSpan = false;
    let propagatedTraceState: string | undefined;

    await runWithPropagatedTraceContext(carrier, 'worker.with-tracestate', async () => {
      sawActiveSpan = trace.getActiveSpan() !== undefined;
      propagatedTraceState = trace.getActiveSpan()?.spanContext().traceState?.get('vendor');
    });

    expect(sawActiveSpan).toBe(true);
    // The carrier's tracestate must survive extraction, not just the traceparent's trace id.
    expect(propagatedTraceState).toBe('opaque-value');
    const span = spanExporter
      .getFinishedSpans()
      .find((finished) => finished.name === 'worker.with-tracestate');
    expect(span?.spanContext().traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(span?.spanContext().traceState?.get('vendor')).toBe('opaque-value');
  });
});

describe('trace context propagation (API → mail enqueue → worker)', () => {
  let spanExporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    spanExporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
    });
    provider.register({
      propagator: new W3CTraceContextPropagator(),
    });
  });

  afterEach(async () => {
    await provider.shutdown();
    trace.disable();
  });

  it('links producer and consumer spans in one trace', async () => {
    const tracer = trace.getTracer('test');

    await tracer.startActiveSpan('http.request', async (parentSpan) => {
      const carrier = captureTraceContextForPropagation();
      expect(carrier.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[1-9a-f]$/);

      await runWithPropagatedTraceContext(carrier, 'mail.send-email', async () => {
        const activeSpan = trace.getActiveSpan();
        expect(activeSpan).toBeDefined();
        expect(activeSpan?.spanContext().traceId).toBe(parentSpan.spanContext().traceId);
      });

      parentSpan.end();
    });

    const spans = spanExporter.getFinishedSpans();
    expect(spans).toHaveLength(2);

    const httpSpan = spans.find((span) => span.name === 'http.request');
    const mailSpan = spans.find((span) => span.name === 'mail.send-email');

    expect(httpSpan).toBeDefined();
    expect(mailSpan).toBeDefined();
    expect(mailSpan?.parentSpanContext?.spanId).toBe(httpSpan?.spanContext().spanId);
    expect(mailSpan?.spanContext().traceId).toBe(httpSpan?.spanContext().traceId);
  });

  it('injects traceparent into mail job payload when enqueueing within an active span', async () => {
    const addMock = vi.fn().mockResolvedValue({ id: 'job-1' });

    vi.doMock('bullmq', () => ({
      Queue: class MockQueue {
        add = addMock;
        close = vi.fn();
      },
    }));

    vi.doMock('@/infrastructure/queue/connection.js', () => ({
      getBullMQKeyPrefix: () => 'test:bull',
      getBullMQConnectionOptions: () => ({}),
      getBullMQProducerConnectionOptions: () => ({ enableOfflineQueue: false }),
    }));

    vi.doMock('@/infrastructure/mail/mail-outbox.repository.js', () => ({
      insertMailOutbox: vi.fn(),
    }));

    const tracer = trace.getTracer('test');

    await tracer.startActiveSpan('http.request', async (parentSpan) => {
      const { enqueueMailOutboxJob } = await import('@/infrastructure/mail/queues/mail.queue.js');
      await enqueueMailOutboxJob('6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f', {
        requestId: 'req-trace-test',
      });
      parentSpan.end();
    });

    expect(addMock).toHaveBeenCalledOnce();
    const jobPayload = addMock.mock.calls[0]?.[1] as {
      mailOutboxToken: string;
      requestId: string;
      traceparent?: string;
    };
    expect(jobPayload.mailOutboxToken).toBe('6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f');
    expect(jobPayload.requestId).toBe('req-trace-test');
    expect(jobPayload.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[1-9a-f]$/);

    vi.doUnmock('bullmq');
    vi.doUnmock('@/infrastructure/queue/connection.js');
    vi.doUnmock('@/infrastructure/mail/mail-outbox.repository.js');
  });

  it('runWithPropagatedTraceContext runs without a span when traceparent is absent', async () => {
    let callbackRan = false;
    await runWithPropagatedTraceContext({}, 'mail.send-email', async () => {
      callbackRan = true;
      expect(trace.getActiveSpan()).toBeUndefined();
    });
    expect(callbackRan).toBe(true);
    expect(spanExporter.getFinishedSpans()).toHaveLength(0);
  });
});
