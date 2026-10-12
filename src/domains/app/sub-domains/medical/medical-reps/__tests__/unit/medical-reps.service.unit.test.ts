import { describeAppRecordServiceContract } from '@/tests/helpers/app-record-service-contract.helper.js';

/** Medical Reps: a create body, a change, a list query and an action are parsed before any database work. */
describeAppRecordServiceContract('medicalRepsService');
