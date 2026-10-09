import type { PatientIdeaSource } from './patient-ideas.constants.js';

/** An active offering an idea can name — the clinic's menu, in catalogue order. */
export interface IdeaOffering {
  id: number;
  publicId: string;
  name: string;
  category: string;
  sessions: number;
  /** Rupees, as stored (`numeric(12,2)` text). */
  price: string;
}

/** What the prototype's rules read of a patient (routes-final 7.N, PI1). */
export interface PatientIdeasHistory {
  /** The doctor's treatment-suggestion notes, newest first. */
  treatmentSuggestions: string[];
  /** The complaint notes, newest first. */
  complaints: string[];
  /** The diagnosis notes (the catalogue's name when one is linked), newest first. */
  diagnoses: string[];
  /** Completed visits plus done treatments. */
  visitCount: number;
  /** The latest done treatment's name, else the latest completed visit's service, else null. */
  lastServiceName: string | null;
  /** The offerings of the patient's packages with at most one session left. */
  packagesAlmostUsedOfferingIds: number[];
}

/** One idea, before it is shaped for the API. */
export interface PatientIdea {
  offering: IdeaOffering;
  reason: string;
  source: PatientIdeaSource;
}

/** One idea as the API answers it. */
export interface PatientIdeaOutput {
  offering_id: string;
  offering_name: string;
  category: string;
  sessions: number;
  price: number;
  reason: string;
  source: PatientIdeaSource;
}

/** The ideas route's `meta` (PI2). */
export interface PatientIdeasMeta {
  source: 'ai' | 'rules';
  ai_refreshed_at: string | null;
}

/** A patient's ideas as the route answers them. */
export interface PatientIdeasResult {
  data: PatientIdeaOutput[];
  meta: PatientIdeasMeta;
}

/** One stored AI idea, as read back. */
export interface StoredPatientIdea {
  offeringId: number;
  reason: string;
  position: number;
  createdAt: Date;
}

/** A patient the refresh takes (PI5). */
export interface StalePatient {
  id: number;
  contactId: number;
  hasDataConsent: boolean;
  /** The stale mark in UTC to the microsecond (`…T06:00:00.123456Z`) — the compare-and-clear's key. */
  staleSince: string;
}

/** The de-identified summary Claude sees (PI6) — nothing that names or reaches the patient. */
export interface PatientIdeasSummary {
  /** Concern labels (`hair fall`, `acne`, …) the complaints name — never their text. */
  complaints: string[];
  /** The diagnoses' catalogue names, and an unlinked diagnosis's concern labels. */
  diagnoses: string[];
  treatments: { name: string; month: string }[];
  packages: { offering: string; sessions_left: number }[];
  completed_visits: number;
  already_planned: string[];
}
