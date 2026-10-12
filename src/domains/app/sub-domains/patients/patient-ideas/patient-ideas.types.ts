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

/** A patient's ideas as the route answers them. */
export interface PatientIdeasResult {
  data: PatientIdeaOutput[];
}
