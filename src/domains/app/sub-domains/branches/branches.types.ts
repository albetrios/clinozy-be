/** The branch fields a create or update writes (internal ids already resolved). */
interface BranchWritableFields {
  name: string;
  tone: string;
  is_main: boolean;
  address_line_one: string;
  address_line_two: string | null;
  area: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
  email: string;
  gst_number: string | null;
  opens_at: string;
  closes_at: string;
  working_days: string[];
  default_doctor_membership_id: number | null;
  default_front_desk_membership_id: number | null;
  default_therapist_membership_id: number | null;
  default_pharmacist_membership_id: number | null;
  is_active: boolean;
  maps_link: string | null;
  review_link: string | null;
}

/** Repository payload for inserting a branch. */
export type BranchCreateData = Pick<
  BranchWritableFields,
  'name' | 'address_line_one' | 'area' | 'city' | 'postal_code' | 'phone' | 'email'
> &
  Partial<BranchWritableFields> & {
    organization_id: number;
    created_by_user_id?: number;
  };

/** Repository payload for updating a branch (only the provided fields change). */
export type BranchUpdateData = Partial<BranchWritableFields>;
