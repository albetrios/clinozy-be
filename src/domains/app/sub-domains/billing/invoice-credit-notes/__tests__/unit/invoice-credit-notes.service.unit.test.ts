import { describeAppRecordServiceContract } from '@/tests/helpers/app-record-service-contract.helper.js';

/** Invoice Credit Notes: a create body, a change, a list query and an action are parsed before any database work. */
describeAppRecordServiceContract('invoiceCreditNotesService', { refusesUpdate: /never edited/ });
