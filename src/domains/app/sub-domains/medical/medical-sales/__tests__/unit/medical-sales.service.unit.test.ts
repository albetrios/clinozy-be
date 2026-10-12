import { describeAppRecordServiceContract } from '@/tests/helpers/app-record-service-contract.helper.js';

/** Medical Sales: a create body, a change, a list query and an action are parsed before any database work. */
describeAppRecordServiceContract('medicalSalesService', { refusesUpdate: /never edited/ });
