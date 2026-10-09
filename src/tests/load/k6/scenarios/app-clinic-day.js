import http from 'k6/http';
import { sleep } from 'k6';
import { API_PREFIX } from '../helpers/config.js';
import { checkOk } from '../helpers/checks.js';
import { authHeaders } from '../helpers/auth.js';
import { idempotencyKey } from '../helpers/idempotency.js';

/**
 * k6 Scenario: a clinic day on the app (task X2, docs/reviews/launch-confidence-plan-2026-10-09.md).
 *
 * Three groups of users at once, with p95 targets per call:
 * - Today — the front desk's day: the day's appointments and the daily counts.
 * - The patient file — the patient, then its notes, treatments, bought offerings and ideas.
 * - Billing — an invoice and its payment, one bill every six seconds.
 *
 * Paced to about 90 requests a minute in all: the API's global limiter allows RATE_LIMIT_MAX
 * (default 100) requests a minute per IP address, and a k6 run is one address. For a heavier run,
 * raise RATE_LIMIT_MAX on the target and the VUs here together.
 *
 * Needs TEST_TOKEN: an Owner's access token for a team organization with at least one branch (sign
 * up, switch to the organization, add a branch). Optional DURATION (default 30s).
 */
const DURATION = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    today: { executor: 'constant-vus', vus: 1, duration: DURATION, exec: 'today' },
    patientFile: { executor: 'constant-vus', vus: 1, duration: DURATION, exec: 'patientFile' },
    billing: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '6s',
      duration: DURATION,
      preAllocatedVUs: 2,
      maxVUs: 4,
      exec: 'billing',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:today-appointments}': ['p(95)<400'],
    'http_req_duration{name:today-daily-counts}': ['p(95)<300'],
    'http_req_duration{name:patient-read}': ['p(95)<300'],
    'http_req_duration{name:patient-lists}': ['p(95)<400'],
    'http_req_duration{name:patient-ideas}': ['p(95)<500'],
    'http_req_duration{name:invoice-create}': ['p(95)<700'],
    'http_req_duration{name:payment-create}': ['p(95)<700'],
  },
};

/** A JSON write with its idempotency key. */
function write(path, body, data, name) {
  return http.post(`${API_PREFIX}${path}`, JSON.stringify(body), {
    headers: {
      ...authHeaders(data.token).headers,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey(name),
    },
    tags: { name },
  });
}

/** The organization's first branch, an offering, a patient — what the three groups work on. */
export function setup() {
  const token = __ENV.TEST_TOKEN;
  if (!token) throw new Error('TEST_TOKEN env var required');
  const headers = authHeaders(token).headers;
  const branches = http.get(`${API_PREFIX}/app/branches`, { headers });
  const branch = JSON.parse(branches.body).data?.[0]?.id;
  if (!branch) throw new Error('the organization has no branch — add one first');
  const stamp = Date.now();
  const data = { token, branch };
  const offering = write(
    '/app/offerings',
    { name: `Load consult ${stamp}`, price: 500 },
    data,
    'setup',
  );
  const contact = write(
    '/app/contacts',
    {
      first_name: 'Load',
      last_name: `k6${stamp}`,
      phones: [{ phone: `+9198${String(stamp).slice(-8)}`, is_primary: true }],
    },
    data,
    'setup',
  );
  const contactId = JSON.parse(contact.body).data.id;
  const patient = write(
    '/app/patients',
    { contact_id: contactId, home_branch_id: branch },
    data,
    'setup',
  );
  return {
    token,
    branch,
    offering: JSON.parse(offering.body).data.id,
    contact: contactId,
    patient: JSON.parse(patient.body).data.id,
    today: new Date().toISOString().slice(0, 10),
  };
}

/** The front desk's Today: the day's appointments and the daily counts. */
export function today(data) {
  const headers = authHeaders(data.token).headers;
  const appointments = http.get(
    `${API_PREFIX}/app/appointments?branch_id=${data.branch}&appointment_date_from=${data.today}&appointment_date_to=${data.today}&limit=50`,
    { headers, tags: { name: 'today-appointments' } },
  );
  checkOk(appointments, 'today-appointments');
  const counts = http.get(
    `${API_PREFIX}/app/appointments/daily-counts?branch_ids=${data.branch}&date_from=${data.today}&date_to=${data.today}`,
    { headers, tags: { name: 'today-daily-counts' } },
  );
  checkOk(counts, 'today-daily-counts');
  sleep(4);
}

/** The patient file: the patient, its lists and its offering ideas. */
export function patientFile(data) {
  const headers = authHeaders(data.token).headers;
  const file = `${API_PREFIX}/app/patients/${data.patient}`;
  checkOk(http.get(file, { headers, tags: { name: 'patient-read' } }), 'patient-read');
  for (const list of ['clinical-notes', 'treatments', 'offerings', 'prescriptions']) {
    checkOk(
      http.get(`${file}/${list}?limit=20`, { headers, tags: { name: 'patient-lists' } }),
      `patient-${list}`,
    );
  }
  checkOk(
    http.get(`${file}/offering-ideas`, { headers, tags: { name: 'patient-ideas' } }),
    'patient-ideas',
  );
  sleep(9);
}

/** Billing: an invoice for the patient, paid in full. */
export function billing(data) {
  const invoice = write(
    '/app/invoices',
    {
      branch_id: data.branch,
      contact_id: data.contact,
      items: [{ offering_id: data.offering, quantity: 1 }],
    },
    data,
    'invoice-create',
  );
  if (!checkOk(invoice, 'invoice-create')) return;
  const bill = JSON.parse(invoice.body).data;
  checkOk(
    write(
      '/app/payments',
      {
        kind: 'receipt',
        branch_id: data.branch,
        contact_id: data.contact,
        invoice_id: bill.id,
        splits: [{ mode: 'upi', amount: Number(bill.total) }],
      },
      data,
      'payment-create',
    ),
    'payment-create',
  );
}
