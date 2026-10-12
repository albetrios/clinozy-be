import type { SeedContext } from '@/scripts/seed/seed-contract.js';
import { seedContact, seedContactMember } from './contacts.seed.js';

/**
 * Seeds three contacts per organization in the registry — two of them one household sharing a
 * number (CT3) — and makes each organization's owner the first one's handler (CT11). Idempotent: an
 * existing name is kept.
 */
export async function seedContactsBulk(context: SeedContext): Promise<void> {
  const organizations = context.registry.organizations;
  if (organizations.length === 0) {
    context.logger.warn(
      'seed.bulk.contacts: empty organization pool; run the tenancy seeder first',
    );
    return;
  }
  for (const organization of organizations) {
    const createdBy = organization.ownerUserId;
    const riya = await seedContact({
      organization_id: organization.id,
      first_name: 'Riya',
      last_name: 'Shah',
      phone: '+919800000101',
      preference_tags: ['no_calls', 'after_six_pm'],
      created_by_user_id: createdBy,
    });
    await seedContact({
      organization_id: organization.id,
      first_name: 'Aarav',
      last_name: 'Shah',
      phone: '+919800000101',
      household_contact_id: riya,
      created_by_user_id: createdBy,
    });
    await seedContact({
      organization_id: organization.id,
      first_name: 'Meera',
      last_name: 'Patel',
      phone: '+919800000102',
      preference_tags: ['gujarati'],
      created_by_user_id: createdBy,
    });
    await seedContactMember({
      contact_id: riya,
      organization_id: organization.id,
      user_id: createdBy,
    });
  }
}
