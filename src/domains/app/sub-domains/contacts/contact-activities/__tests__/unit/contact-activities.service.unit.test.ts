import { describeAppRecordServiceContract } from '@/tests/helpers/app-record-service-contract.helper.js';

/** Contact Activities: a create body, a change, a list query and an action are parsed before any database work. */
describeAppRecordServiceContract('contactActivitiesService', {
  refusesCreate: /created thr/,
  refusesUpdate: /append-only/,
});
