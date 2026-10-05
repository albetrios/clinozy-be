import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { user_data_exports } from '@/domains/user/sub-domains/user-data-export/user-data-export.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

export interface CreateUserDataExportOptions {
  userId: number;
  status?: string;
}

/**
 * Create a test data export owned by `userId` (auth.user_data_exports).
 */
export async function createTestUserDataExport(options: CreateUserDataExportOptions) {
  const publicId = generatePublicId('userDataExport');
  // The operator connection: auth.user_data_exports is FORCE RLS, and a fixture written through
  // the pool under test would need the owner's scope on the RLS-subject application role.
  const [exportRow] = await getOperatorDatabase()
    .insert(user_data_exports)
    .values({
      public_id: publicId,
      user_id: options.userId,
      status: options.status ?? 'pending',
    })
    .returning();
  return exportRow!;
}
