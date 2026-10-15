import { describe, expect, it } from 'vitest';
import { BranchesSerializer } from '@/domains/app/sub-domains/branches/branches.serializer.js';

/**
 * A full `app.branches` read as the repository returns it — wider than the summary, so a field the
 * summary does not allow would show up in the output.
 */
function branchRow(overrides: Record<string, unknown> = {}) {
  return {
    public_id: 'brn_q4w8e2r6t1y5u9i3o7p0a',
    name: 'Adajan',
    tone: 'sage',
    is_main: true,
    address_line_one: '12 Anand Mahal Road',
    address_line_two: null,
    area: 'Adajan',
    city: 'Surat',
    state: 'Gujarat',
    postal_code: '395009',
    phone: '+919825012345',
    email: 'adajan@example.com',
    gst_number: '24ABCDE1234F1Z5',
    opens_at: '10:00:00',
    closes_at: '20:00:00',
    working_days: ['mon', 'tue'],
    default_doctor_membership_public_id: 'mem_a1s2d3f4g5h6j7k8l9z0x',
    default_front_desk_membership_public_id: null,
    default_therapist_membership_public_id: null,
    default_pharmacist_membership_public_id: null,
    is_active: true,
    maps_link: 'https://maps.example.com/adajan',
    review_link: 'https://g.page/r/CQadajanbranchEAE/review',
    created_at: new Date('2026-10-07T09:00:00.000Z'),
    updated_at: new Date('2026-10-07T09:00:00.000Z'),
    ...overrides,
  };
}

/**
 * The `GET /app/branches/my` summary is a typed allow-list (launch D81; feat-payment-celebration
 * BR1–BR2): every member reads it, so it carries the review link and nothing else of the full branch.
 */
describe('BranchesSerializer.summaries', () => {
  it("returns the summary's fields, the Google review link included, and nothing else", () => {
    const [summary] = BranchesSerializer.summaries([branchRow()]);

    expect(summary).toEqual({
      id: 'brn_q4w8e2r6t1y5u9i3o7p0a',
      name: 'Adajan',
      tone: 'sage',
      is_main: true,
      address_line_one: '12 Anand Mahal Road',
      address_line_two: null,
      area: 'Adajan',
      city: 'Surat',
      state: 'Gujarat',
      postal_code: '395009',
      phone: '+919825012345',
      gst_number: '24ABCDE1234F1Z5',
      opens_at: '10:00',
      closes_at: '20:00',
      working_days: ['mon', 'tue'],
      review_link: 'https://g.page/r/CQadajanbranchEAE/review',
    });
  });

  it('returns null for a branch without a review link', () => {
    const [summary] = BranchesSerializer.summaries([branchRow({ review_link: null })]);

    expect(summary).toHaveProperty('review_link', null);
  });

  it('keeps the email, default staff, maps link, status and audit times out of the summary', () => {
    const [summary] = BranchesSerializer.summaries([branchRow()]);

    for (const field of [
      'email',
      'default_doctor_membership_id',
      'default_front_desk_membership_id',
      'default_therapist_membership_id',
      'default_pharmacist_membership_id',
      'maps_link',
      'is_active',
      'created_at',
      'updated_at',
    ]) {
      expect(summary).not.toHaveProperty(field);
    }
  });
});
