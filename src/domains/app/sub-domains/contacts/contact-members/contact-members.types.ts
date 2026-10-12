/** A team member who handles a contact, as the API returns it (routes-final 4.B.6). */
export interface ContactMemberOutput {
  /** `mem_…` */
  membership_id: string;
  /** When they were added. */
  created_at: string;
}
