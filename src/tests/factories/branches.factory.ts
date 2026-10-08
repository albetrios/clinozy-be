import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { branch_members } from '@/domains/app/sub-domains/branches/branch-members/branch-members.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

/** Options for {@link createTestBranch}. */
export interface CreateBranchOptions {
  organizationId: number;
  name?: string;
  isMain?: boolean;
  isActive?: boolean;
  createdByUserId?: number;
}

/** Inserts a branch with valid required fields (operator connection, bypassing RLS). */
export async function createTestBranch(options: CreateBranchOptions) {
  const publicId = generatePublicId('branch');
  const [branch] = await getOperatorDatabase()
    .insert(branches)
    .values({
      public_id: publicId,
      organization_id: options.organizationId,
      name: options.name ?? `Branch ${publicId.slice(-6)}`,
      is_main: options.isMain ?? false,
      is_active: options.isActive ?? true,
      address_line_one: '1 Main Road',
      area: 'Adajan',
      city: 'Surat',
      postal_code: '395009',
      phone: '+919800000000',
      email: 'branch@example.com',
      created_by_user_id: options.createdByUserId,
    })
    .returning();
  return branch!;
}

/** Gives a membership access to a branch (operator connection). */
export async function grantTestBranchMember(options: {
  branchId: number;
  membershipId: number;
  organizationId: number;
}) {
  await getOperatorDatabase().insert(branch_members).values({
    branch_id: options.branchId,
    membership_id: options.membershipId,
    organization_id: options.organizationId,
  });
}
