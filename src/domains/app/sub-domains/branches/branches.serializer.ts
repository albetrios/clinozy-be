import { toHourMinute } from '@/shared/utils/validation/record-fields.util.js';
type SerializableTimestamp = Date | string;

/** A branch row as the repository reads it, with its default staff as membership public ids. */
interface BranchRecord {
  public_id: string;
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
  default_doctor_membership_public_id: string | null;
  default_front_desk_membership_public_id: string | null;
  default_therapist_membership_public_id: string | null;
  default_pharmacist_membership_public_id: string | null;
  is_active: boolean;
  maps_link: string | null;
  review_link: string | null;
  created_at: SerializableTimestamp;
  updated_at: SerializableTimestamp;
}

/**
 * The fields `GET /app/branches/my` returns — what a picker and the booking rules need, and the
 * address, phone and GSTIN a printed GST invoice carries (D81).
 */
interface BranchSummaryRecord {
  public_id: string;
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
  gst_number: string | null;
  opens_at: string;
  closes_at: string;
  working_days: string[];
}

function toIsoString(value: SerializableTimestamp): string {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeOne(row: BranchRecord) {
  return {
    id: row.public_id,
    name: row.name,
    tone: row.tone,
    is_main: row.is_main,
    address_line_one: row.address_line_one,
    address_line_two: row.address_line_two,
    area: row.area,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    phone: row.phone,
    email: row.email,
    gst_number: row.gst_number,
    opens_at: toHourMinute(row.opens_at),
    closes_at: toHourMinute(row.closes_at),
    working_days: row.working_days,
    default_doctor_membership_id: row.default_doctor_membership_public_id,
    default_front_desk_membership_id: row.default_front_desk_membership_public_id,
    default_therapist_membership_id: row.default_therapist_membership_public_id,
    default_pharmacist_membership_id: row.default_pharmacist_membership_public_id,
    is_active: row.is_active,
    maps_link: row.maps_link,
    review_link: row.review_link,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

function serializeSummary(row: BranchSummaryRecord) {
  return {
    id: row.public_id,
    name: row.name,
    tone: row.tone,
    is_main: row.is_main,
    address_line_one: row.address_line_one,
    address_line_two: row.address_line_two,
    area: row.area,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    phone: row.phone,
    gst_number: row.gst_number,
    opens_at: toHourMinute(row.opens_at),
    closes_at: toHourMinute(row.closes_at),
    working_days: row.working_days,
  };
}

/**
 * Response shaping for branches — a typed allow-list: the public id becomes `id`; the internal
 * id, organization id, membership bigints and audit user ids never leave the API.
 */
export const BranchesSerializer = {
  one(row: BranchRecord) {
    return serializeOne(row);
  },
  many(rows: readonly BranchRecord[]) {
    return rows.map((row) => serializeOne(row));
  },
  summaries(rows: readonly BranchSummaryRecord[]) {
    return rows.map((row) => serializeSummary(row));
  },
};
