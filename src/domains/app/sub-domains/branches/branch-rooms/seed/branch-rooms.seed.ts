import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { branch_rooms } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.schema.js';

/** A room to seed in a branch: every column but the public id. */
export type SeedBranchRoomValues = Omit<typeof branch_rooms.$inferInsert, 'public_id'>;

/** Inserts a room in a branch (the demo clinic's consultation and procedure rooms); returns its id. */
export async function seedBranchRoom(values: SeedBranchRoomValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(branch_rooms)
    .values({ public_id: generatePublicId('room'), ...values })
    .returning({ id: branch_rooms.id });
  return row!.id;
}
