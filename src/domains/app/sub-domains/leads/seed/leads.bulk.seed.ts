import type { SeedContext } from '@/scripts/seed/seed-contract.js';
import { seedLead } from './leads.seed.js';

/**
 * Seeds two leads per organization in the registry on the contacts seed's people: Riya's open
 * Instagram enquiry, owned and held by the organization's owner, and Meera's, contacted and open to
 * the team. Idempotent: a contact that already has a lead is kept.
 */
export async function seedLeadsBulk(context: SeedContext): Promise<void> {
  const organizations = context.registry.organizations;
  if (organizations.length === 0) {
    context.logger.warn('seed.bulk.leads: empty organization pool; run the tenancy seeder first');
    return;
  }
  for (const organization of organizations) {
    await seedLead({
      organization_id: organization.id,
      first_name: 'Riya',
      last_name: 'Shah',
      status: 'new',
      source: 'instagram',
      interests: ['lhr', 'hydrafacial'],
      owner_user_id: organization.ownerUserId,
      created_by_user_id: organization.ownerUserId,
    });
    await seedLead({
      organization_id: organization.id,
      first_name: 'Meera',
      last_name: 'Patel',
      status: 'contacted',
      source: 'google',
      interests: ['peel'],
      created_by_user_id: organization.ownerUserId,
    });
  }
}
