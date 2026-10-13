import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';

/** A row of `app.tasks` to seed: every column but the public id. */
export type SeedTaskValues = Omit<typeof tasks.$inferInsert, 'public_id'>;

/** Inserts a task on the team's work queue; returns its id. */
export async function seedTask(values: SeedTaskValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(tasks)
    .values({ public_id: generatePublicId('task'), ...values })
    .returning({ id: tasks.id });
  return row!.id;
}
