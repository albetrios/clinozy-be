import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { branch_machines } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.schema.js';

/** A machine to seed in a branch: every column but the public id. */
export type SeedBranchMachineValues = Omit<typeof branch_machines.$inferInsert, 'public_id'>;

/** Inserts a machine in a branch (the demo clinic's lasers); returns its id. */
export async function seedBranchMachine(values: SeedBranchMachineValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(branch_machines)
    .values({ public_id: generatePublicId('machine'), ...values })
    .returning({ id: branch_machines.id });
  return row!.id;
}
