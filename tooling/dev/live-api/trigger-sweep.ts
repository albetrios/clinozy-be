// TEMPORARY (the launch iteration's curl checks — removed with tooling/dev/live-api/): adds one run
// of a sweep to its queue, as its cron would; the live worker takes it. Usage:
// `tsx tooling/dev/live-api/trigger-sweep.ts <day-close|task-rules>` — the day auto-close (WC-39,
// checks/billing.checks.sh) or the task rules (TK4, checks/tasks.checks.sh).
import '@/shared/config/load-env-files.js';
import { Queue } from 'bullmq';
import {
  getBullMQKeyPrefix,
  getBullMQProducerConnectionOptions,
} from '@/infrastructure/queue/connection.js';
import { DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME } from '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.constants.js';
import { TASK_RULES_SWEEP_QUEUE_NAME } from '@/domains/app/sub-domains/tasks/workers/task-rules.constants.js';

const SWEEPS: Record<string, { queueName: string; jobName: string }> = {
  'day-close': {
    queueName: DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME,
    jobName: 'find-days-to-auto-close',
  },
  'task-rules': {
    queueName: TASK_RULES_SWEEP_QUEUE_NAME,
    jobName: 'find-organizations-for-task-rules',
  },
};

const sweep = SWEEPS[process.argv[2] ?? ''];
if (!sweep) {
  process.stderr.write(`usage: trigger-sweep.ts <${Object.keys(SWEEPS).join('|')}>\n`);
  process.exit(2);
}
const queue = new Queue(sweep.queueName, {
  connection: getBullMQProducerConnectionOptions(),
  prefix: getBullMQKeyPrefix(),
});
await queue.add(sweep.jobName, {}, { removeOnComplete: true, removeOnFail: true });
await queue.close();
process.exit(0);
