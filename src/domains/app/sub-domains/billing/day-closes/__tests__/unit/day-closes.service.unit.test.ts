import { describeAppRecordServiceContract } from '@/tests/helpers/app-record-service-contract.helper.js';

/** Day Closes: a create body, a change, a list query and an action are parsed before any database work. */
describeAppRecordServiceContract('dayClosesService', { refusesUpdate: /never changed/ });
