import { describeAppRecordServiceContract } from '@/tests/helpers/app-record-service-contract.helper.js';

/** Patient Clinical Notes: a create body, a change, a list query and an action are parsed before any database work. */
describeAppRecordServiceContract('patientClinicalNotesService', { refusesUpdate: /never edited/ });
