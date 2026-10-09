import { describeAppRecordServiceContract } from '@/tests/helpers/app-record-service-contract.helper.js';

/** Stock Counts: a create body, a change, a list query and an action are parsed before any database work. */
describeAppRecordServiceContract('stockCountsService', { refusesUpdate: /never changed/ });
