/** Allowed values of `patient_reports.type`. */
export const PATIENT_REPORT_TYPE_VALUES = ['lab', 'scan', 'consent', 'other'] as const;

/** Most files on one report (P29). */
export const PATIENT_REPORT_FILE_KEYS_MAX = 10;

/** The longest report notes. */
export const PATIENT_REPORT_NOTES_MAX = 1000;
