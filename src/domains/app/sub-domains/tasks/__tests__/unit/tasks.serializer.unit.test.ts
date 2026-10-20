import { describe, expect, it } from 'vitest';
import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { serializeTask } from '@/domains/app/sub-domains/tasks/tasks.serializer.js';

const noReferences = { publicIdOf: () => null } as unknown as BaseRecordReferenceLookup;

/**
 * Locks in that each instant of a task reads its own column. Only DB-bound tests asserted
 * `snoozed_until`, so pre-push never saw it serialized from `due_at` (planted-bug drill A2-4,
 * 20 Oct 2026).
 */
describe('serializeTask — its instants', () => {
  it('reads due_at, snoozed_until and resolved_at from their own columns', () => {
    const row = {
      public_id: 'task_a',
      kind: 'manual',
      title: 'Call back',
      status: 'snoozed',
      priority: 'normal',
      is_resolved_automatically: false,
      due_at: new Date('2026-10-20T09:00:00.000Z'),
      snoozed_until: new Date('2026-10-22T09:00:00.000Z'),
      resolved_at: null,
      created_at: new Date('2026-10-19T09:00:00.000Z'),
      updated_at: new Date('2026-10-19T10:00:00.000Z'),
    } as unknown as BaseRecordRow;
    const task = serializeTask({ row, references: noReferences });
    expect(task.due_at).toBe('2026-10-20T09:00:00.000Z');
    expect(task.snoozed_until).toBe('2026-10-22T09:00:00.000Z');
    expect(task.resolved_at).toBeNull();
  });
});
