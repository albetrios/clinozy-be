// TEMPORARY (the launch iteration's curl checks — removed with tooling/dev/live-api/): adds one run
// of the day auto-close sweep (WC-39) to its queue, as the hourly cron would; the live worker takes
// it. Used by checks/billing.checks.sh.
import '@/shared/config/load-env-files.js';
import { Queue } from 'bullmq';
import {
  getBullMQKeyPrefix,
  getBullMQProducerConnectionOptions,
} from '@/infrastructure/queue/connection.js';
import { DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME } from '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.constants.js';

const queue = new Queue(DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME, {
  connection: getBullMQProducerConnectionOptions(),
  prefix: getBullMQKeyPrefix(),
});
await queue.add('find-days-to-auto-close', {}, { removeOnComplete: true, removeOnFail: true });
await queue.close();
process.exit(0);
