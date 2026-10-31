/**
 * A patient photo as the API returns it (launch ROUTE #133, routes-final 7.F.6): one of three
 * albums, optionally filed under its visit, its session and a stage (P23, P24).
 */
export interface PatientImageOutput {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  patient_treatment_id: string | null;
  album: string;
  stage: string | null;
  /** The confirmed upload's object key */
  file_key: string;
  /**
   * Its thumbnail's object key (a 320 px WebP next to the photo), made in the background after the
   * photo is filed — null until then, or when none can be made
   */
  thumbnail_key: string | null;
  /** The upload's file name (P25) */
  file_name: string;
  /**
   * A link that shows the photo, valid 15 minutes, made fresh on every read (D86) — null when its
   * upload is gone
   */
  file_url: string | null;
  /**
   * The grid's image: a 15-minute link to the thumbnail, or `file_url`'s link while the photo has
   * none — open the photo with `file_url`
   */
  thumbnail_url: string | null;
  display_name: string | null;
  caption: string | null;
  body_part: string | null;
  taken_on: string;
  /** Its visit's service (the date groups — P26), or null */
  service_label: string | null;
  created_at: string;
  updated_at: string;
}
