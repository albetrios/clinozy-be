import { eq, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { task_rule_settings } from './task-rule-settings.schema.js';

/** One saved rule row. */
export type TaskRuleSettingRow = typeof task_rule_settings.$inferSelect;

/**
 * Persistence for `app.task_rule_settings` (launch ROUTE #138, routes-final 10.B) — the
 * organization's saved rule rows and their upsert.
 *
 * @remarks
 * - **Algorithm:** one row per rule; a save upserts on `(organization_id, rule_key)` — a switch not
 *   sent keeps its value (a new row takes the defaults: on, by hand).
 */
export class TaskRuleSettingsRepository {
  /** The organization's saved rule rows. */
  async findAll(organizationId: number): Promise<TaskRuleSettingRow[]> {
    return getRequestDatabase()
      .select()
      .from(task_rule_settings)
      .where(eq(task_rule_settings.organization_id, organizationId));
  }

  /** Saves one rule's sent switches (TK10). */
  async upsert(options: {
    organizationId: number;
    ruleKey: string;
    isOn: boolean | undefined;
    isAutomatic: boolean | undefined;
    userId: number | null;
  }): Promise<void> {
    const sent = {
      ...(options.isOn === undefined ? {} : { is_on: options.isOn }),
      ...(options.isAutomatic === undefined ? {} : { is_automatic: options.isAutomatic }),
    };
    await getRequestDatabase()
      .insert(task_rule_settings)
      .values({
        public_id: generatePublicId('taskRuleSetting'),
        organization_id: options.organizationId,
        rule_key: options.ruleKey,
        ...sent,
        created_by_user_id: options.userId,
        updated_by_user_id: options.userId,
      })
      .onConflictDoUpdate({
        target: [task_rule_settings.organization_id, task_rule_settings.rule_key],
        set: {
          ...sent,
          updated_at: sql`greatest(${task_rule_settings.created_at}, now())`,
          updated_by_user_id: options.userId,
        },
      });
  }
}
