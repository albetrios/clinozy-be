import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Sub-domain 7, Patients 7.A–7.M (routes-final §7, launch ROUTE #133–#135): the patient file on
 * its contact, one per contact, check-in opening one, the list's search, filters, sorts and
 * export; clinical notes, prescriptions and their approval, kits, the diagnosis catalogue, photos
 * in three albums, reports; treatments, check-ins, reviews and feedback actions; the bought
 * offerings and the plan; the clinical gates (P14), the private album (P23) and the `system`
 * entries in the contact's activity (M10) — one flow over the fixture organization.
 */
describe('Patients — integration (routes-final §7)', () => {
  const S = String(Date.now());
  /** This run's last name — `q=${lastName}` lists only this run's patient files. */
  const lastName = `x${S}`;
  const digits = `7${S.slice(-7)}`;
  const NOWHERE_CONTACT = 'con_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_PATIENT = 'pat_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_MEMBERSHIP = 'mem_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_MEDICINE = 'med_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_TREATMENT = 'trt_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_CHECK_IN = 'chk_aaaaaaaaaaaaaaaaaaaaa';
  const FIELDS = '[.error.errors[].field] | join(",")';
  const REASON = '.error.reason';
  const DELETE_REASON = 'reason=mistake';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let adajan = '';
  let admin = '';
  let doctor = '';
  let therapist = '';
  let today = '';
  let tomorrow = '';
  let yesterday = '';
  let inAMonth = '';

  let asha = '';
  let bina = '';
  let chetan = '';
  let dev = '';
  let esha = '';
  let ashaFile = '';
  let ashaNumber = '';
  let binaFile = '';
  let eshaFile = '';
  let chetanFile = '';
  let chetanLead = '';
  let chetanVisit = '';
  let diagnosis = '';
  let prescription = '';
  let medicineLine: Record<string, unknown> = {};
  let photo = '';
  let pngKey = '';

  let hydrafacial = '';
  let peel = '';
  let retiredOffering = '';
  let chetanBought = '';
  let chetanExpired = '';
  let ashaBought = '';
  let devFile = '';
  let devVisit = '';
  let firstSession = '';
  let worseCheckIn = '';
  let goodCheckIn = '';
  let sameCheckIn = '';

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  /**
   * A confirmed upload of the fixture organization (the S3 round trip is out of reach here);
   * returns its key.
   */
  async function confirmedUpload(name: string, mimeType: string, bytes: number): Promise<string> {
    const key = `organizations/${fixture.organization.publicId}/uploads/${lastName}-${name}`;
    await getOperatorSql()`
      INSERT INTO upload.uploads (public_id, user_id, organization_id, file_name, file_key, mime_type,
        file_size, bucket, status, uploaded_at)
      VALUES (${generatePublicId('upload')}, ${fixture.members.owner.userId}, ${fixture.organization.id},
        ${name}, ${key}, ${mimeType}, ${bytes}, 'local', 'UPLOADED', now())
    `;
    return key;
  }

  /** A bill of nothing for the patient's contact at Vesu dated `date`; returns its public id. */
  async function invoiceOn(patientFile: string, date: string): Promise<string> {
    const publicId = generatePublicId('invoice');
    await getOperatorSql()`
      INSERT INTO app.invoices (public_id, organization_id, branch_id, contact_id, invoice_date)
      SELECT ${publicId}, b.organization_id, b.id, p.contact_id, ${date}
      FROM app.branches b, app.patients p
      WHERE b.public_id = ${vesu} AND p.public_id = ${patientFile}
    `;
    return publicId;
  }

  /**
   * A bought offering of the patient on a line of `invoice` (a bill of its own when none is named)
   * — the shape an invoice's save writes, with `total` sessions and `validUntil` as the check
   * needs them; returns its public id.
   */
  async function boughtOffering(options: {
    patientFile: string;
    offering: string;
    total: number;
    validUntil: string;
    invoice?: string;
  }): Promise<string> {
    const publicId = generatePublicId('patientOffering');
    const invoice = options.invoice ?? (await invoiceOn(options.patientFile, today));
    await getOperatorSql()`
      WITH line AS (
        INSERT INTO app.invoice_items (public_id, organization_id, invoice_id, line_number,
          offering_id, name, quantity, rate, gst_percent, is_gst_inclusive, taxable_amount,
          gst_amount, amount)
        SELECT ${generatePublicId('invoiceItem')}, i.organization_id, i.id,
          (SELECT count(*) + 1 FROM app.invoice_items WHERE invoice_id = i.id), f.id, f.name,
          1, 0, 0, true, 0, 0, 0
        FROM app.invoices i, app.offerings f
        WHERE i.public_id = ${invoice} AND f.public_id = ${options.offering}
        RETURNING id)
      INSERT INTO app.patient_offerings (public_id, organization_id, patient_id, offering_id,
        invoice_item_id, sessions_total, valid_until)
      SELECT ${publicId}, p.organization_id, p.id, f.id, line.id, ${options.total}, ${options.validUntil}
      FROM line, app.patients p, app.offerings f
      WHERE p.public_id = ${options.patientFile} AND f.public_id = ${options.offering}
    `;
    return publicId;
  }

  /** The bought offering's spent sessions. */
  async function sessionsUsed(bought: string): Promise<string> {
    const [row] = await getOperatorSql()<{ sessions_used: number }[]>`
      SELECT sessions_used FROM app.patient_offerings WHERE public_id = ${bought}
    `;
    return String(row?.sessions_used);
  }

  /** The call-back tasks a check-in or review made (TR4). */
  async function callBacks(source: string): Promise<string> {
    const [row] = await getOperatorSql()<{ count: string }[]>`
      SELECT count(*)::text AS count FROM app.tasks t
        LEFT JOIN app.patient_check_ins c ON c.id = t.patient_check_in_id
        LEFT JOIN app.patient_reviews r ON r.id = t.patient_review_id
      WHERE t.rule_key = 'call_back' AND ${source} IN (c.public_id, r.public_id)
    `;
    return row?.count ?? '0';
  }

  /** A walk-in body at Vesu with the doctor. */
  const walkIn = (contact: string) => ({
    contact_id: contact,
    branch_id: vesu,
    doctor_membership_id: doctor,
    service_label: 'Consultation',
    is_walk_in: true,
  });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    adajan = fixture.branches.adajan;
    admin = fixture.members.admin.membershipPublicId;
    doctor = fixture.members.doctor.membershipPublicId;
    therapist = fixture.members.therapist.membershipPublicId;
    today = calendarDay(fixture, 0);
    tomorrow = calendarDay(fixture, 1);
    yesterday = calendarDay(fixture, -1);
    inAMonth = calendarDay(fixture, 30);
    flow.as('owner');
    asha = await person('Asha', '51');
    bina = await person('Bina', '52');
    chetan = await person('Chetan', '53');
    dev = await person('Dev', '54');
  });

  afterAll(async () => {
    await app.close();
  });

  it('7.A create (route 3, P1)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "create Asha's file (doctor, types, allergies)",
      'POST',
      '/app/patients',
      {
        contact_id: asha,
        home_branch_id: vesu,
        doctor_membership_id: doctor,
        types: ['aesthetic', 'lhr'],
        allergies: ['Penicillin'],
        notes: 'Prefers mornings',
      },
    );
    ashaFile = flow.last('.data.id');
    ashaNumber = flow.last('.data.patient_number');
    flow.expectValue(
      'create: the contact only (P3)',
      '[.data.contact_id, (.data | has("contact")), (.data | has("first_name"))] | map(tostring) | join(",")',
      `${asha},false,false`,
    );
    flow.expectValue(
      'create: new, not converted (P4)',
      '[.data.status, .data.conversion, (.data.lead_id | tostring)] | join(",")',
      'new,not_converted,null',
    );
    flow.expectValue('create: numbered', '.data.patient_number > 0', true);
    await flow.expect(
      200,
      'the usual doctor handles the contact (7.10)',
      'GET',
      `/app/contacts/${asha}`,
    );
    flow.expectValue(
      "doctor on the contact's team",
      `[.data.member_membership_ids[] | select(. == "${doctor}")] | length`,
      1,
    );
    await flow.expect(409, 'a second file for Asha', 'POST', '/app/patients', {
      contact_id: asha,
      home_branch_id: vesu,
    });
    flow.expectValue(
      'second file: why',
      `[${REASON}, (.error.detail | test("PT-"))] | map(tostring) | join(",")`,
      'contact_is_patient,true',
    );
    await flow.expect(400, 'contact_id and contact both', 'POST', '/app/patients', {
      contact_id: bina,
      contact: { first_name: 'Both', phones: [{ phone: '+919999999999', is_primary: true }] },
      home_branch_id: vesu,
    });
    flow.expectValue('both: field', FIELDS, 'body.contact_id');
    await flow.expect(400, 'neither contact_id nor contact', 'POST', '/app/patients', {
      home_branch_id: vesu,
    });
    await flow.expect(400, 'no home branch', 'POST', '/app/patients', { contact_id: bina });
    flow.expectValue('no home branch: field', FIELDS, 'body.home_branch_id');
    await flow.expect(400, 'an unknown contact', 'POST', '/app/patients', {
      contact_id: NOWHERE_CONTACT,
      home_branch_id: vesu,
    });
    await flow.expect(400, 'an unknown doctor', 'POST', '/app/patients', {
      contact_id: bina,
      home_branch_id: vesu,
      doctor_membership_id: NOWHERE_MEMBERSHIP,
    });
    flow.expectValue('unknown doctor: field', FIELDS, 'doctor_membership_id');
    await flow.expect(400, 'a person field on the file (P2)', 'POST', '/app/patients', {
      contact_id: bina,
      home_branch_id: vesu,
      first_name: 'Bina',
    });
    await flow.expect(400, 'a type twice', 'POST', '/app/patients', {
      contact_id: bina,
      home_branch_id: vesu,
      types: ['aesthetic', 'aesthetic'],
    });
    await flow.expect(
      422,
      'create without X-Idempotency-Key',
      'POST',
      '/app/patients',
      { contact_id: bina, home_branch_id: vesu },
      { idempotencyKey: false },
    );
    await flow.expect(200, "create Bina's file at Adajan", 'POST', '/app/patients', {
      contact_id: bina,
      home_branch_id: adajan,
      types: ['clinical'],
      status: 'vip',
      follow_up_at: '2030-01-02T10:00:00+05:30',
    });
    binaFile = flow.last('.data.id');
    await flow.expect(200, 'create with a new contact (P1)', 'POST', '/app/patients', {
      contact: {
        first_name: 'Esha',
        last_name: lastName,
        phones: [{ phone: `+91${digits}55`, is_primary: true }],
      },
      home_branch_id: vesu,
      types: ['dental'],
    });
    eshaFile = flow.last('.data.id');
    esha = flow.last('.data.contact_id');
    flow.expectValue(
      'inline contact: a new con_ id',
      `[(.data.contact_id | startswith("con_")), (.data.contact_id != "${asha}")] | map(tostring) | join(",")`,
      'true,true',
    );
    await flow.expect(
      409,
      "an inline contact on another household's number",
      'POST',
      '/app/patients',
      {
        contact: { first_name: 'Copy', phones: [{ phone: `+91${digits}55`, is_primary: true }] },
        home_branch_id: vesu,
      },
    );
    flow.expectValue('taken number: why', REASON, 'contact_phone_exists');
  });

  it('check-in opens a file (A14, P4, P10)', async () => {
    flow.as('owner');
    await flow.expect(200, "Chetan's lead", 'POST', '/app/leads', {
      contact_id: chetan,
      interests: ['lhr'],
    });
    chetanLead = flow.last('.data.id');
    await flow.expect(200, 'Chetan walks in', 'POST', '/app/appointments', walkIn(chetan));
    chetanVisit = flow.last('.data.id');
    chetanFile = flow.last('.data.patient_id');
    flow.expectValue('the walk-in opened a file', '.data.patient_id | startswith("pat_")', true);
    await flow.expect(200, "Chetan's file", 'GET', `/app/patients/${chetanFile}`);
    flow.expectValue(
      'opened at check-in: lead, branch, doctor, not converted (P4, P10)',
      '[.data.lead_id, .data.home_branch_id, .data.doctor_membership_id, .data.conversion] | join(",")',
      `${chetanLead},${vesu},${doctor},not_converted`,
    );
  });

  it('read, list, export (routes 1, 2, 4)', async () => {
    flow.as('owner');
    await flow.expect(200, "get Asha's file", 'GET', `/app/patients/${ashaFile}`);
    flow.expectValue(
      'get: the fields',
      '[(.data.types | join("|")), (.data.allergies | join("|")), .data.notes] | join(",")',
      'aesthetic|lhr,Penicillin,Prefers mornings',
    );
    await flow.expect(404, 'an unknown file', 'GET', `/app/patients/${NOWHERE_PATIENT}`);
    await flow.expect(
      200,
      "list this run's files (q, the contacts' names)",
      'GET',
      `/app/patients?q=${lastName}&sort=patient_number&order=asc`,
    );
    flow.expectValue('q by name: four files, numbered order', '.data | length', 4);
    flow.expectValue("the first is Asha's", '.data[0].id', ashaFile);
    await flow.expect(
      200,
      'q: PT-number',
      'GET',
      `/app/patients?q=PT-${ashaNumber.padStart(4, '0')}`,
    );
    flow.expectValue('PT-number: Asha', '[.data[].id] | join(",")', ashaFile);
    await flow.expect(200, 'q: #number', 'GET', `/app/patients?q=%23${ashaNumber}`);
    flow.expectValue('#number: Asha', '[.data[].id] | join(",")', ashaFile);
    await flow.expect(200, "q: Bina's number", 'GET', `/app/patients?q=${digits}52`);
    flow.expectValue('number: Bina', '[.data[].id] | join(",")', binaFile);
    await flow.expect(400, 'q too short', 'GET', '/app/patients?q=ab');
    await flow.expect(
      200,
      'types: any of them',
      'GET',
      `/app/patients?q=${lastName}&types=lhr,dental`,
    );
    flow.expectValue(
      'types lhr or dental: Asha, Esha',
      '[.data[].id] | sort | join(",")',
      [ashaFile, eshaFile].sort().join(','),
    );
    await flow.expect(200, 'status vip', 'GET', `/app/patients?q=${lastName}&status=vip`);
    flow.expectValue('vip: Bina', '[.data[].id] | join(",")', binaFile);
    await flow.expect(
      200,
      'home branch Adajan',
      'GET',
      `/app/patients?q=${lastName}&home_branch_id=${adajan}`,
    );
    flow.expectValue('Adajan: Bina', '[.data[].id] | join(",")', binaFile);
    await flow.expect(
      200,
      'doctor',
      'GET',
      `/app/patients?q=${lastName}&doctor_membership_id=${doctor}`,
    );
    flow.expectValue("doctor's: Asha, Chetan", '.data | length', 2);
    await flow.expect(200, 'contact', 'GET', `/app/patients?contact_id=${chetan}`);
    flow.expectValue('contact: Chetan', '[.data[].id] | join(",")', chetanFile);
    await flow.expect(200, 'conversion', 'GET', `/app/patients?q=${lastName}&conversion=converted`);
    flow.expectValue('none converted yet', '.data | length', 0);
    await flow.expect(
      200,
      'sort follow_up_at: a file without one last',
      'GET',
      `/app/patients?q=${lastName}&sort=follow_up_at`,
    );
    flow.expectValue('follow-up first: Bina', '.data[0].id', binaFile);
    await flow.expect(400, 'an unknown sort', 'GET', '/app/patients?sort=first_name');
    await flow.expect(200, 'export', 'GET', `/app/patients/exports?q=${lastName}`);
    flow.expectValue(
      "export: four rows with the contact's name and number",
      `[.data.row_count, (.data.content | test("contact_name")), (.data.content | test("Asha ${lastName}")), (.data.content | test("${digits}51"))] | map(tostring) | join(",")`,
      '4,true,true,true',
    );
  });

  it('change (route 5)', async () => {
    flow.as('owner');
    await flow.call('GET', `/app/patients/${ashaFile}`);
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(200, "change Asha's file", 'PATCH', `/app/patients/${ashaFile}`, {
      status: 'regular',
      conversion: 'converted',
      contraindications: ['Pregnancy'],
      expected_updated_at: updatedAt,
    });
    flow.expectValue(
      'changed (conversion editable, P4)',
      '[.data.status, .data.conversion, (.data.contraindications | join("|"))] | join(",")',
      'regular,converted,Pregnancy',
    );
    await flow.expect(409, 'a stale save', 'PATCH', `/app/patients/${ashaFile}`, {
      status: 'vip',
      expected_updated_at: updatedAt,
    });
    flow.expectValue('stale: why', REASON, 'record_changed');
    await flow.expect(400, 'an empty change', 'PATCH', `/app/patients/${ashaFile}`, {});
    await flow.expect(400, 'the contact cannot change', 'PATCH', `/app/patients/${ashaFile}`, {
      contact_id: dev,
    });
    await flow.expect(400, 'lead_id is read-only', 'PATCH', `/app/patients/${ashaFile}`, {
      lead_id: chetanLead,
    });
    await flow.expect(200, 'a new usual doctor', 'PATCH', `/app/patients/${binaFile}`, {
      doctor_membership_id: admin,
    });
    await flow.expect(200, "Bina's contact", 'GET', `/app/contacts/${bina}`);
    flow.expectValue(
      'the new doctor handles Bina',
      `[.data.member_membership_ids[] | select(. == "${admin}")] | length`,
      1,
    );
  });

  it('delete and restore (routes 6, 7, P1, P7)', async () => {
    flow.as('owner');
    await flow.expect(
      204,
      "remove Esha's file",
      'DELETE',
      `/app/patients/${eshaFile}?${DELETE_REASON}`,
    );
    await flow.expect(404, 'a removed file', 'GET', `/app/patients/${eshaFile}`);
    await flow.expect(404, 'its notes with it', 'GET', `/app/patients/${eshaFile}/clinical-notes`);
    await flow.expect(400, 'remove without a reason', 'DELETE', `/app/patients/${binaFile}`);
    await flow.expect(200, 'a new file for Esha meanwhile', 'POST', '/app/patients', {
      contact_id: esha,
      home_branch_id: vesu,
    });
    const eshaSecondFile = flow.last('.data.id');
    await flow.expect(409, 'restore over the new one', 'POST', `/app/patients/${eshaFile}/restore`);
    flow.expectValue('restore: why', REASON, 'contact_is_patient');
    await flow.expect(
      204,
      'remove the new one',
      'DELETE',
      `/app/patients/${eshaSecondFile}?${DELETE_REASON}`,
    );
    await flow.expect(200, 'restore the first', 'POST', `/app/patients/${eshaFile}/restore`);
    await flow.expect(409, 'restore a live file', 'POST', `/app/patients/${eshaFile}/restore`);
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(
      409,
      'a contact with a file is not removed (CT7)',
      'DELETE',
      `/app/contacts/${esha}?${DELETE_REASON}`,
    );
  });

  it('7.E the diagnosis catalogue (routes 27–32)', async () => {
    flow.as('owner');
    await flow.expect(200, 'add a diagnosis', 'POST', '/app/patient-diagnoses', {
      name: `Acne ${lastName}`,
    });
    diagnosis = flow.last('.data.id');
    flow.expectValue('dgn_ id', '.data.id | startswith("dgn_")', true);
    await flow.expect(
      409,
      'the same name in another case (P18)',
      'POST',
      '/app/patient-diagnoses',
      {
        name: `ACNE ${lastName}`,
      },
    );
    await flow.expect(200, 'add another', 'POST', '/app/patient-diagnoses', {
      name: `Melasma ${lastName}`,
    });
    const melasma = flow.last('.data.id');
    await flow.expect(200, 'the catalogue by name', 'GET', `/app/patient-diagnoses?q=${lastName}`);
    flow.expectValue(
      'by name: Acne, Melasma',
      '[.data[].name] | join(",")',
      `Acne ${lastName},Melasma ${lastName}`,
    );
    const updatedAt = flow.last('.data[1].updated_at');
    await flow.expect(
      409,
      "rename onto another's name",
      'PATCH',
      `/app/patient-diagnoses/${melasma}`,
      { name: `acne ${lastName}` },
    );
    await flow.expect(200, 'rename', 'PATCH', `/app/patient-diagnoses/${melasma}`, {
      name: `Chloasma ${lastName}`,
      expected_updated_at: updatedAt,
    });
    await flow.expect(409, 'a stale rename', 'PATCH', `/app/patient-diagnoses/${melasma}`, {
      name: `Melasma ${lastName}`,
      expected_updated_at: updatedAt,
    });
    await flow.expect(
      204,
      'delete it',
      'DELETE',
      `/app/patient-diagnoses/${melasma}?${DELETE_REASON}`,
    );
    await flow.expect(200, 'its name reused', 'POST', '/app/patient-diagnoses', {
      name: `Chloasma ${lastName}`,
    });
    await flow.expect(
      409,
      'restore over the reused name',
      'POST',
      `/app/patient-diagnoses/${melasma}/restore`,
    );
    flow.expectValue('reused: why', REASON, 'record_restore_conflict');
    flow.as('marketing');
    await flow.expect(
      200,
      'every member reads the catalogue',
      'GET',
      `/app/patient-diagnoses?q=${lastName}`,
    );
    await flow.expect(200, 'every member reads one', 'GET', `/app/patient-diagnoses/${diagnosis}`);
    await flow.expect(403, 'marketing adds none', 'POST', '/app/patient-diagnoses', {
      name: `Rosacea ${lastName}`,
    });
    flow.as('therapist');
    await flow.expect(
      403,
      "a therapist adds none (prescribers' catalogue)",
      'POST',
      '/app/patient-diagnoses',
      { name: `Rosacea ${lastName}` },
    );
  });

  it('7.B clinical notes (routes 8–12, P12, P14)', async () => {
    flow.as('owner');
    const notes = `/app/patients/${ashaFile}/clinical-notes`;
    await flow.expect(200, 'a complaint', 'POST', notes, {
      kind: 'complaint',
      text: 'Breakouts on both cheeks',
    });
    const complaint = flow.last('.data.id');
    flow.expectValue(
      'complaint: no visit, no catalogue entry',
      '[(.data.appointment_id | tostring), (.data.patient_diagnosis_id | tostring), .data.patient_id] | join(",")',
      `null,null,${ashaFile}`,
    );
    await flow.expect(200, 'a diagnosis from the catalogue', 'POST', notes, {
      kind: 'diagnosis',
      text: 'Grade 2 acne',
      patient_diagnosis_id: diagnosis,
    });
    const diagnosisNote = flow.last('.data.id');
    flow.expectValue('diagnosis: its entry', '.data.patient_diagnosis_id', diagnosis);
    await flow.expect(400, 'a catalogue entry on a complaint', 'POST', notes, {
      kind: 'complaint',
      text: 'x',
      patient_diagnosis_id: diagnosis,
    });
    flow.expectValue('catalogue entry: field', FIELDS, 'body.patient_diagnosis_id');
    await flow.expect(400, 'a new kind is checked', 'POST', notes, { kind: 'rumour', text: 'x' });
    await flow.expect(400, 'a note of 501 characters', 'POST', notes, {
      kind: 'finding',
      text: 'x'.repeat(501),
    });
    await flow.expect(
      200,
      "a safety check on Chetan's visit",
      'POST',
      `/app/patients/${chetanFile}/clinical-notes`,
      { kind: 'safety_check', text: 'No allergies', appointment_id: chetanVisit },
    );
    const chetanNote = flow.last('.data.id');
    await flow.expect(400, "another patient's visit (TR3)", 'POST', notes, {
      kind: 'finding',
      text: 'x',
      appointment_id: chetanVisit,
    });
    flow.expectValue("another's visit: field", FIELDS, 'appointment_id');
    await flow.expect(200, "Asha's notes", 'GET', notes);
    flow.expectValue(
      'two notes, newest first',
      '[.data[].id] | join(",")',
      `${diagnosisNote},${complaint}`,
    );
    await flow.expect(200, 'kind filter (several)', 'GET', `${notes}?kind=complaint,finding`);
    flow.expectValue('kind: the complaint', '[.data[].id] | join(",")', complaint);
    await flow.expect(200, 'q: the text', 'GET', `${notes}?q=cheeks`);
    flow.expectValue('q: the complaint', '[.data[].id] | join(",")', complaint);
    await flow.expect(
      200,
      "a visit's notes",
      'GET',
      `/app/patients/${chetanFile}/clinical-notes?appointment_id=${chetanVisit}`,
    );
    flow.expectValue("visit: Chetan's note", '[.data[].id] | join(",")', chetanNote);
    await flow.expect(200, 'get one', 'GET', `${notes}/${complaint}`);
    await flow.expect(
      404,
      'under another patient',
      'GET',
      `/app/patients/${binaFile}/clinical-notes/${complaint}`,
    );
    await flow.expect(404, 'notes are never edited (no PATCH)', 'PATCH', `${notes}/${complaint}`, {
      text: 'y',
    });
    await flow.expect(
      204,
      'delete a wrong note',
      'DELETE',
      `${notes}/${complaint}?${DELETE_REASON}`,
    );
    await flow.expect(404, 'a deleted note', 'GET', `${notes}/${complaint}`);
    await flow.expect(200, 'restore it', 'POST', `${notes}/${complaint}/restore`);
    await flow.expect(409, 'restore a live note', 'POST', `${notes}/${complaint}/restore`);
    await flow.expect(
      200,
      "the contact's activity (M10)",
      'GET',
      `/app/contacts/${asha}/activities?type=system`,
    );
    flow.expectValue(
      'a system entry per note',
      '[.data[] | select(.patient_clinical_note_id != null)] | length',
      2,
    );
    flow.as('front_desk');
    await flow.expect(403, 'the front desk reads no notes (P14)', 'GET', notes);
    await flow.expect(403, 'the front desk writes none (P14)', 'POST', notes, {
      kind: 'complaint',
      text: 'x',
    });
    await flow.expect(200, 'the front desk reads the file', 'GET', `/app/patients/${ashaFile}`);
    await flow.expect(
      200,
      "the front desk's activity",
      'GET',
      `/app/contacts/${asha}/activities?type=system`,
    );
    flow.expectValue(
      'note entries hidden from the front desk (M10)',
      '[.data[] | select(.patient_clinical_note_id != null)] | length',
      0,
    );
    flow.as('therapist');
    await flow.expect(200, 'a therapist writes a note', 'POST', notes, {
      kind: 'finding',
      text: 'Mild erythema',
    });
  });

  it('7.C prescriptions (routes 13–20, P15, P16)', async () => {
    flow.as('owner');
    await flow.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', {
      name: `Pharma ${lastName}`,
    });
    const manufacturer = flow.last('.data.id');
    await flow.expect(200, 'a medicine', 'POST', '/app/medicines', {
      name: `Tretinoin ${lastName}`,
      manufacturer_id: manufacturer,
      mrp: 120,
    });
    const medicine = flow.last('.data.id');
    medicineLine = {
      medicine_name: 'Tretinoin 0.025%',
      medicine_id: medicine,
      dose_night: 1,
      meal: 'after',
      quantity: 1,
    };
    const prescriptions = `/app/patients/${ashaFile}/prescriptions`;
    await flow.expect(200, 'write a draft', 'POST', prescriptions, {
      doctor_membership_id: doctor,
      prescription_date: today,
      items: [medicineLine],
      advice: 'Sunscreen daily',
    });
    prescription = flow.last('.data.id');
    const prescriptionNumber = flow.last('.data.prescription_number');
    flow.expectValue(
      'draft: rx_, lines, no approver',
      '[(.data.id | startswith("rx_")), .data.status, (.data.items | length), (.data.approved_by_membership_id | tostring)] | map(tostring) | join(",")',
      'true,draft,1,null',
    );
    await flow.expect(400, 'a line of no live medicine (P15)', 'POST', prescriptions, {
      doctor_membership_id: doctor,
      prescription_date: today,
      items: [{ medicine_name: 'Ghost', medicine_id: NOWHERE_MEDICINE }],
    });
    flow.expectValue('no medicine: field', FIELDS, 'items');
    await flow.expect(400, '31 lines (P16)', 'POST', prescriptions, {
      doctor_membership_id: doctor,
      prescription_date: today,
      items: Array.from({ length: 31 }, () => ({ medicine_name: 'M' })),
    });
    await flow.expect(400, 'an unknown doctor', 'POST', prescriptions, {
      doctor_membership_id: NOWHERE_MEMBERSHIP,
      prescription_date: today,
    });
    await flow.expect(400, "another patient's visit", 'POST', prescriptions, {
      doctor_membership_id: doctor,
      prescription_date: today,
      appointment_id: chetanVisit,
    });
    await flow.expect(200, 'an empty draft', 'POST', prescriptions, {
      doctor_membership_id: doctor,
      prescription_date: today,
    });
    const emptyPrescription = flow.last('.data.id');
    await flow.expect(
      400,
      'approve with no line',
      'POST',
      `${prescriptions}/${emptyPrescription}/approve`,
    );
    flow.expectValue('no line: field', FIELDS, 'items');
    await flow.call('GET', `${prescriptions}/${prescription}`);
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(200, 'change the draft', 'PATCH', `${prescriptions}/${prescription}`, {
      follow_up_date: tomorrow,
      expected_updated_at: updatedAt,
    });
    await flow.expect(409, 'a stale change', 'PATCH', `${prescriptions}/${prescription}`, {
      advice: 'x',
      expected_updated_at: updatedAt,
    });
    flow.as('doctor');
    await flow.expect(
      200,
      'the doctor approves',
      'POST',
      `${prescriptions}/${prescription}/approve`,
    );
    flow.expectValue(
      'approved by the doctor (P15)',
      '[.data.status, .data.approved_by_membership_id, (.data.approved_at != null)] | map(tostring) | join(",")',
      `approved,${doctor},true`,
    );
    await flow.expect(409, 'approve again', 'POST', `${prescriptions}/${prescription}/approve`);
    flow.expectValue('again: why', REASON, 'transition_not_allowed');
    await flow.expect(409, 'change an approved one', 'PATCH', `${prescriptions}/${prescription}`, {
      advice: 'x',
    });
    flow.expectValue('approved: why', REASON, 'prescription_approved');
    flow.as('owner');
    await flow.expect(
      409,
      'delete an approved one (P15)',
      'DELETE',
      `${prescriptions}/${prescription}?${DELETE_REASON}`,
    );
    flow.expectValue('delete approved: why', REASON, 'prescription_approved');
    await flow.expect(
      204,
      'delete a draft',
      'DELETE',
      `${prescriptions}/${emptyPrescription}?${DELETE_REASON}`,
    );
    await flow.expect(200, 'restore it', 'POST', `${prescriptions}/${emptyPrescription}/restore`);
    await flow.expect(
      200,
      'the pharmacy queue',
      'GET',
      `/app/patient-prescriptions?status=approved&patient_id=${ashaFile}`,
    );
    flow.expectValue('queue: the approved one', '[.data[].id] | join(",")', prescription);
    await flow.expect(
      200,
      'q: RX-number',
      'GET',
      `/app/patient-prescriptions?q=RX-${prescriptionNumber}`,
    );
    flow.expectValue('RX-number: it', '[.data[].id] | join(",")', prescription);
    await flow.expect(400, 'q: not a number', 'GET', '/app/patient-prescriptions?q=tretinoin');
    flow.expectValue('q: field', FIELDS, 'q');
    await flow.expect(
      200,
      'the nested list: the path wins (TR3)',
      'GET',
      `${prescriptions}?patient_id=${binaFile}`,
    );
    flow.expectValue("path wins: Asha's two", '.data | length', 2);
    await flow.expect(
      200,
      'date range (inclusive)',
      'GET',
      `${prescriptions}?prescription_date_from=${today}&prescription_date_to=${today}&sort=prescription_date`,
    );
    flow.expectValue("today's: two", '.data | length', 2);
    await flow.expect(
      404,
      'under another patient',
      'GET',
      `/app/patients/${binaFile}/prescriptions/${prescription}`,
    );
    await flow.expect(
      200,
      "the contact's activity",
      'GET',
      `/app/contacts/${asha}/activities?type=system`,
    );
    flow.expectValue(
      "the approval's entry (M10)",
      `[.data[] | select(.patient_prescription_id == "${prescription}")] | length`,
      1,
    );
    flow.as('pharmacist');
    await flow.expect(
      200,
      'the pharmacist reads the queue',
      'GET',
      '/app/patient-prescriptions?status=approved',
    );
    await flow.expect(403, 'the pharmacist writes none', 'POST', prescriptions, {
      doctor_membership_id: doctor,
      prescription_date: today,
    });
    flow.as('front_desk');
    await flow.expect(403, 'the front desk reads no prescriptions', 'GET', prescriptions);
  });

  it('7.D prescription kits (routes 21–26, P17)', async () => {
    flow.as('doctor');
    await flow.expect(200, 'the doctor saves a kit', 'POST', '/app/prescription-kits', {
      name: `Acne ${lastName}`,
      items: [medicineLine],
    });
    const kit = flow.last('.data.id');
    flow.expectValue(
      "kit: rxk_, the doctor's",
      '[(.data.id | startswith("rxk_")), .data.owner_membership_id] | map(tostring) | join(",")',
      `true,${doctor}`,
    );
    await flow.expect(409, 'the same name in another case', 'POST', '/app/prescription-kits', {
      name: `ACNE ${lastName}`,
      items: [],
    });
    await flow.expect(400, 'a kit line of no live medicine', 'POST', '/app/prescription-kits', {
      name: `Ghost ${lastName}`,
      items: [{ medicine_name: 'Ghost', medicine_id: NOWHERE_MEDICINE }],
    });
    await flow.expect(200, 'my kits', 'GET', `/app/prescription-kits?q=${lastName}`);
    flow.expectValue('mine: one', '[.data[].id] | join(",")', kit);
    const updatedAt = flow.last('.data[0].updated_at');
    await flow.expect(200, 'rename it', 'PATCH', `/app/prescription-kits/${kit}`, {
      name: `Acne starter ${lastName}`,
      expected_updated_at: updatedAt,
    });
    await flow.expect(409, 'a stale change', 'PATCH', `/app/prescription-kits/${kit}`, {
      name: `x ${lastName}`,
      expected_updated_at: updatedAt,
    });
    flow.as('owner');
    await flow.expect(200, "the owner's kits", 'GET', `/app/prescription-kits?q=${lastName}`);
    flow.expectValue("another member's kit never shows", '.data | length', 0);
    await flow.expect(404, "another member's kit by id", 'GET', `/app/prescription-kits/${kit}`);
    await flow.expect(200, "the owner's own kit, same name", 'POST', '/app/prescription-kits', {
      name: `Acne starter ${lastName}`,
      items: [],
    });
    flow.as('doctor');
    await flow.expect(
      204,
      'delete the kit',
      'DELETE',
      `/app/prescription-kits/${kit}?${DELETE_REASON}`,
    );
    await flow.expect(200, 'the name reused', 'POST', '/app/prescription-kits', {
      name: `Acne starter ${lastName}`,
      items: [],
    });
    await flow.expect(
      409,
      'restore over the reused name',
      'POST',
      `/app/prescription-kits/${kit}/restore`,
    );
    flow.expectValue('reused: why', REASON, 'record_restore_conflict');
    flow.as('front_desk');
    await flow.expect(403, 'the front desk has no kits', 'GET', '/app/prescription-kits');
  });

  it('7.F photos (routes 33–38, P19, P23–P26)', async () => {
    flow.as('owner');
    const jpgKey = await confirmedUpload('cheek.jpg', 'image/jpeg', 1_048_576);
    pngKey = await confirmedUpload('back.png', 'image/png', 2048);
    const privateJpgKey = await confirmedUpload('private.jpg', 'image/jpeg', 4096);
    const pdfKey = await confirmedUpload('lab.pdf', 'application/pdf', 4096);
    const bigKey = await confirmedUpload('huge.jpg', 'image/jpeg', 16_777_216);
    const images = `/app/patients/${chetanFile}/images`;
    await flow.expect(200, "a photo of Chetan's visit", 'POST', images, {
      file_key: jpgKey,
      appointment_id: chetanVisit,
      stage: 'before',
      body_part: 'upper_lip',
      display_name: 'Lip',
    });
    photo = flow.last('.data.id');
    flow.expectValue(
      "photo: general, today, the upload's name, the visit's label",
      '[.data.album, .data.taken_on, .data.file_name, .data.service_label] | join(",")',
      `general,${today},cheek.jpg,Consultation`,
    );
    flow.expectValue(
      'its link (D86): a 15-minute signed GET of its key, shown inline under its name',
      '[(.data.file_url | test("^https://")), (.data.file_url | contains("cheek.jpg")), (.data.file_url | test("X-Amz-Expires=900")), (.data.file_url | test("response-content-disposition=inline"))] | map(tostring) | join(",")',
      'true,true,true,true',
    );
    await flow.expect(409, 'the same upload again (P25)', 'POST', images, { file_key: jpgKey });
    flow.expectValue('again: why', REASON, 'image_exists');
    await flow.expect(400, 'a PDF', 'POST', images, { file_key: pdfKey });
    flow.expectValue('PDF: field', FIELDS, 'file_key');
    await flow.expect(400, 'over 15 MB', 'POST', images, { file_key: bigKey });
    await flow.expect(400, 'an unconfirmed upload (P19)', 'POST', images, {
      file_key: 'organizations/none/uploads/nothing.jpg',
    });
    await flow.expect(400, 'taken in the future', 'POST', images, {
      file_key: pngKey,
      taken_on: tomorrow,
    });
    flow.expectValue('future: field', FIELDS, 'taken_on');
    await flow.expect(400, "another patient's visit", 'POST', `/app/patients/${ashaFile}/images`, {
      file_key: pngKey,
      appointment_id: chetanVisit,
    });
    await flow.expect(400, 'an unknown session', 'POST', images, {
      file_key: pngKey,
      patient_treatment_id: NOWHERE_TREATMENT,
    });
    await flow.expect(400, 'a body part off the list', 'POST', images, {
      file_key: pngKey,
      body_part: 'elbow',
    });
    await flow.expect(200, 'an LHR photo, not of a visit', 'POST', images, {
      file_key: pngKey,
      album: 'lhr',
      body_part: 'full_body',
    });
    const lhrPhoto = flow.last('.data.id');
    flow.as('therapist');
    await flow.expect(403, 'a therapist files no private photo (P23)', 'POST', images, {
      file_key: privateJpgKey,
      album: 'private',
    });
    flow.expectValue('private: why', REASON, 'field_permission_required');
    flow.as('doctor');
    await flow.expect(200, 'the doctor files a private photo', 'POST', images, {
      file_key: privateJpgKey,
      album: 'private',
    });
    const privatePhoto = flow.last('.data.id');
    await flow.expect(200, "the doctor's tabs", 'GET', images);
    flow.expectValue(
      'every album, with counts (P26)',
      '[(.data | length), .meta.album_counts.general, .meta.album_counts.lhr, .meta.album_counts.private] | map(tostring) | join(",")',
      '3,1,1,1',
    );
    flow.as('therapist');
    await flow.expect(200, "the therapist's tabs", 'GET', images);
    flow.expectValue(
      'no private photo, no private count',
      '[(.data | length), (.meta.album_counts | has("private"))] | map(tostring) | join(",")',
      '2,false',
    );
    flow.expectValue(
      'a link for each photo listed — and so none for the private one (D86, P23)',
      '[.data[] | select(.file_url != null)] | length',
      2,
    );
    await flow.expect(404, 'a private photo by id', 'GET', `${images}/${privatePhoto}`);
    await flow.expect(
      200,
      "the therapist's activity",
      'GET',
      `/app/contacts/${chetan}/activities?type=system&limit=50`,
    );
    flow.expectValue(
      "the private photo's entry hidden (PC16)",
      `[.data[] | select(.patient_image_id == "${privatePhoto}")] | length`,
      0,
    );
    flow.expectValue(
      "the general photo's entry shown",
      `[.data[] | select(.patient_image_id == "${photo}")] | length`,
      1,
    );
    await flow.expect(200, 'album filter', 'GET', `${images}?album=lhr`);
    flow.expectValue('lhr: one', '[.data[].id] | join(",")', lhrPhoto);
    await flow.expect(200, 'not attached to a visit', 'GET', `${images}?has_appointment=false`);
    flow.expectValue('no visit: the LHR one', '[.data[].id] | join(",")', lhrPhoto);
    await flow.expect(200, "a visit's photos", 'GET', `${images}?appointment_id=${chetanVisit}`);
    flow.expectValue('visit: the lip', '[.data[].id] | join(",")', photo);
    await flow.expect(
      200,
      'stage and body part',
      'GET',
      `${images}?stage=before&body_part=upper_lip`,
    );
    flow.expectValue('before, upper lip: the lip', '[.data[].id] | join(",")', photo);
    await flow.expect(200, 'q: the name', 'GET', `${images}?q=Lip`);
    flow.expectValue('q: the lip', '[.data[].id] | join(",")', photo);
    await flow.call('GET', `${images}/${photo}`);
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(200, 'change its caption', 'PATCH', `${images}/${photo}`, {
      caption: 'Before laser',
      expected_updated_at: updatedAt,
    });
    await flow.expect(409, 'a stale change', 'PATCH', `${images}/${photo}`, {
      caption: 'x',
      expected_updated_at: updatedAt,
    });
    await flow.expect(403, 'move it to private (no album code)', 'PATCH', `${images}/${photo}`, {
      album: 'private',
    });
    await flow.expect(400, 'the file key never changes', 'PATCH', `${images}/${photo}`, {
      file_key: pngKey,
    });
    flow.as('doctor');
    await flow.expect(200, 'the doctor moves it to private', 'PATCH', `${images}/${photo}`, {
      album: 'private',
    });
    flow.as('therapist');
    await flow.expect(404, 'now a 404 to the therapist', 'GET', `${images}/${photo}`);
    await flow.expect(
      200,
      "the therapist's activity again",
      'GET',
      `/app/contacts/${chetan}/activities?type=system&limit=50`,
    );
    flow.expectValue(
      'its entry follows into private',
      `[.data[] | select(.patient_image_id == "${photo}")] | length`,
      0,
    );
    flow.as('front_desk');
    await flow.expect(403, 'the front desk sees no photos (P14)', 'GET', images);
    flow.as('owner');
    await flow.expect(204, 'delete a photo', 'DELETE', `${images}/${lhrPhoto}?reason=not_needed`);
    await flow.expect(200, 'restore it', 'POST', `${images}/${lhrPhoto}/restore`);
    await flow.expect(
      404,
      'under another patient',
      'GET',
      `/app/patients/${ashaFile}/images/${lhrPhoto}`,
    );
    const goneKey = await confirmedUpload('gone.png', 'image/png', 2048);
    await flow.expect(200, 'a photo', 'POST', images, { file_key: goneKey });
    const gonePhoto = flow.last('.data.id');
    await getOperatorSql()`UPDATE upload.uploads SET deleted_at = now() WHERE file_key = ${goneKey}`;
    await flow.expect(
      200,
      'the photo after its upload is deleted',
      'GET',
      `${images}/${gonePhoto}`,
    );
    flow.expectValue('no link to a file that is gone (D86)', '.data.file_url == null', true);
  });

  it('7.G reports (routes 39–44, P29)', async () => {
    flow.as('owner');
    const reportKey = await confirmedUpload('cbc.pdf', 'application/pdf', 4096);
    const reports = `/app/patients/${ashaFile}/reports`;
    await flow.expect(200, 'a lab report', 'POST', reports, {
      name: 'CBC',
      report_date: today,
      file_keys: [reportKey],
      notes: 'Normal',
    });
    const report = flow.last('.data.id');
    flow.expectValue(
      'report: prep_, lab, one file',
      '[(.data.id | startswith("prep_")), .data.type, (.data.file_keys | length)] | map(tostring) | join(",")',
      'true,lab,1',
    );
    flow.expectValue(
      "its file (D86): the key, the upload's name and a 15-minute link that shows it",
      `[(.data.files[0].file_key == "${reportKey}"), .data.files[0].file_name, (.data.files[0].file_url | test("X-Amz-Expires=900")), (.data.files[0].file_url | test("response-content-disposition=inline"))] | map(tostring) | join(",")`,
      'true,cbc.pdf,true,true',
    );
    await flow.expect(400, 'an unconfirmed file (P29)', 'POST', reports, {
      name: 'X',
      report_date: today,
      file_keys: ['organizations/none/uploads/x.pdf'],
    });
    flow.expectValue('unconfirmed: field', FIELDS, 'file_keys');
    await flow.expect(400, 'eleven files', 'POST', reports, {
      name: 'X',
      report_date: today,
      file_keys: Array.from({ length: 11 }, (_, index) => `k${index}`),
    });
    await flow.expect(200, 'a scan', 'POST', reports, {
      name: 'Ultrasound',
      type: 'scan',
      report_date: tomorrow,
    });
    const scan = flow.last('.data.id');
    await flow.expect(200, 'the reports, newest first', 'GET', reports);
    flow.expectValue('newest report date first', '[.data[].id] | join(",")', `${scan},${report}`);
    flow.expectValue(
      'each report its own files: none for the scan, the CBC for the lab report (D86)',
      '[.data[] | (.files | map(.file_name) | join("+"))] | join(",")',
      ',cbc.pdf',
    );
    await flow.expect(200, 'type filter', 'GET', `${reports}?type=lab`);
    flow.expectValue('lab: the CBC', '[.data[].id] | join(",")', report);
    await flow.call('GET', `${reports}/${report}`);
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(200, 'change it', 'PATCH', `${reports}/${report}`, {
      notes: 'Low iron',
      expected_updated_at: updatedAt,
    });
    await flow.expect(409, 'a stale change', 'PATCH', `${reports}/${report}`, {
      notes: 'x',
      expected_updated_at: updatedAt,
    });
    await flow.expect(400, 'change to an unconfirmed file', 'PATCH', `${reports}/${report}`, {
      file_keys: ['organizations/none/uploads/y.pdf'],
    });
    await flow.expect(204, 'delete it', 'DELETE', `${reports}/${scan}?${DELETE_REASON}`);
    await flow.expect(200, 'restore it', 'POST', `${reports}/${scan}/restore`);
    await flow.expect(
      404,
      'under another patient',
      'GET',
      `/app/patients/${binaFile}/reports/${report}`,
    );
    await flow.expect(
      200,
      "the contact's activity",
      'GET',
      `/app/contacts/${asha}/activities?type=system`,
    );
    flow.expectValue(
      'a system entry per report',
      '[.data[] | select(.patient_report_id != null)] | length',
      2,
    );
    flow.as('front_desk');
    await flow.expect(403, 'the front desk reads no reports (P29)', 'GET', reports);
    await flow.expect(
      200,
      "the front desk's activity",
      'GET',
      `/app/contacts/${asha}/activities?type=system`,
    );
    flow.expectValue(
      'report entries hidden from the front desk',
      '[.data[] | select(.patient_report_id != null)] | length',
      0,
    );
    flow.as('counsellor');
    await flow.expect(200, 'a counsellor reads reports', 'GET', reports);
  });

  it('gates on the file itself (7.A.4)', async () => {
    flow.as('marketing');
    await flow.expect(200, 'marketing reads files', 'GET', `/app/patients/${ashaFile}`);
    await flow.expect(403, 'marketing adds none', 'POST', '/app/patients', {
      contact_id: dev,
      home_branch_id: vesu,
    });
    await flow.expect(403, 'marketing exports none', 'GET', '/app/patients/exports');
    flow.as('therapist');
    await flow.expect(403, 'a therapist exports none (P5)', 'GET', '/app/patients/exports');
    await flow.expect(
      403,
      'a therapist removes none',
      'DELETE',
      `/app/patients/${binaFile}?${DELETE_REASON}`,
    );
    flow.as('pharmacist');
    await flow.expect(
      200,
      'the pharmacist exports (P5)',
      'GET',
      `/app/patients/exports?q=${lastName}`,
    );
    await flow.expect(403, 'the pharmacist changes none', 'PATCH', `/app/patients/${binaFile}`, {
      status: 'new',
    });
    flow.as('front_desk');
    await flow.expect(200, 'the front desk adds a file', 'POST', '/app/patients', {
      contact_id: dev,
      home_branch_id: vesu,
    });

    // D83 (3): the medical details go to the clinical team, the desk and the pharmacy only.
    const MEDICAL =
      '[((.data.allergies // []) | join("|")), ((.data.contraindications // []) | join("|")), (.data.notes // "")] | join(",")';
    for (const role of ['marketing', 'accountant'] as const) {
      flow.as(role);
      await flow.expect(200, `${role} reads the file`, 'GET', `/app/patients/${ashaFile}`);
      flow.expectValue(
        `${role}: name and contact only — the medical details null`,
        '[.data.allergies, .data.contraindications, .data.notes, (.data.contact_id != null)] | map(tostring) | join(",")',
        'null,null,null,true',
      );
      await flow.expect(200, `${role} lists the files`, 'GET', `/app/patients?q=${lastName}`);
      flow.expectValue(
        `${role}: none in the list either`,
        '[.data[] | (.allergies == null and .contraindications == null and .notes == null)] | all',
        'true',
      );
    }
    flow.as('accountant');
    await flow.expect(200, 'the accountant exports', 'GET', `/app/patients/exports?q=${lastName}`);
    flow.expectValue(
      "the accountant's export: the cells blank",
      '[(.data.content | test("Penicillin")), (.data.content | test("Prefers mornings")), (.data.content | test("Pregnancy")), (.data.content | test("allergies"))] | map(tostring) | join(",")',
      'false,false,false,true',
    );
    for (const role of ['front_desk', 'pharmacist', 'doctor', 'therapist', 'counsellor'] as const) {
      flow.as(role);
      await flow.expect(200, `${role} reads the file`, 'GET', `/app/patients/${ashaFile}`);
      flow.expectValue(
        `${role} sees the medical details`,
        MEDICAL,
        'Penicillin,Pregnancy,Prefers mornings',
      );
    }
    flow.as('pharmacist');
    await flow.expect(200, 'the pharmacist exports', 'GET', `/app/patients/exports?q=${lastName}`);
    flow.expectValue(
      "the pharmacist's export carries them",
      '[(.data.content | test("Penicillin")), (.data.content | test("Prefers mornings"))] | map(tostring) | join(",")',
      'true,true',
    );
  });

  it('#134 set-up: offerings, bought offerings, a booked visit', async () => {
    flow.as('owner');
    await flow.expect(200, 'offering Hydrafacial', 'POST', '/app/offerings', {
      name: `Hydrafacial ${S}`,
      price: 4000,
      sessions: 2,
      validity_days: 60,
    });
    hydrafacial = flow.last('.data.id');
    await flow.expect(200, 'offering Peel', 'POST', '/app/offerings', {
      name: `Peel ${S}`,
      price: 2500,
    });
    peel = flow.last('.data.id');
    await flow.expect(200, 'offering Old', 'POST', '/app/offerings', {
      name: `Old ${S}`,
      price: 100,
    });
    retiredOffering = flow.last('.data.id');
    await flow.expect(200, 'retire Old', 'PATCH', `/app/offerings/${retiredOffering}`, {
      is_active: false,
    });
    chetanBought = await boughtOffering({
      patientFile: chetanFile,
      offering: hydrafacial,
      total: 2,
      validUntil: inAMonth,
    });
    chetanExpired = await boughtOffering({
      patientFile: chetanFile,
      offering: hydrafacial,
      total: 3,
      validUntil: yesterday,
    });
    ashaBought = await boughtOffering({
      patientFile: ashaFile,
      offering: hydrafacial,
      total: 2,
      validUntil: inAMonth,
    });
    await flow.expect(200, 'Dev walks in', 'POST', '/app/appointments', walkIn(dev));
    devVisit = flow.last('.data.id');
    devFile = flow.last('.data.patient_id');
    await flow.expect(
      200,
      "Dev's check-in undone (booked — not a visit)",
      'POST',
      `/app/appointments/${devVisit}/undo-check-in`,
    );
  });

  it('7.H treatments (routes 45–50, TR6–TR8, TR13)', async () => {
    flow.as('owner');
    const treatments = `/app/patients/${chetanFile}/treatments`;
    await flow.expect(400, 'a session in the future (TR8)', 'POST', treatments, {
      name: 'Later',
      performed_at: '2099-01-01T10:00:00Z',
    });
    flow.expectValue('future: field', FIELDS, 'performed_at');
    await flow.expect(
      400,
      'a visit not checked in (TR8)',
      'POST',
      `/app/patients/${devFile}/treatments`,
      { name: 'X', appointment_id: devVisit },
    );
    flow.expectValue('not a visit: field', FIELDS, 'appointment_id');
    await flow.expect(
      400,
      "another patient's visit (TR3)",
      'POST',
      `/app/patients/${ashaFile}/treatments`,
      { name: 'X', appointment_id: chetanVisit },
    );
    await flow.expect(400, 'an inactive offering (O13)', 'POST', treatments, {
      name: 'X',
      offering_id: retiredOffering,
    });
    flow.expectValue('inactive: field', FIELDS, 'offering_id');
    await flow.expect(400, 'a number with a bought session (TR7)', 'POST', treatments, {
      name: 'X',
      patient_offering_id: chetanBought,
      session_number: 3,
    });
    flow.expectValue('number with bought: field', FIELDS, 'body.session_number');
    await flow.expect(400, "another patient's bought offering", 'POST', treatments, {
      name: 'X',
      patient_offering_id: ashaBought,
    });
    flow.expectValue("another's bought: field", FIELDS, 'patient_offering_id');
    await flow.expect(400, 'a bought offering for another offering', 'POST', treatments, {
      name: 'X',
      offering_id: peel,
      patient_offering_id: chetanBought,
    });
    flow.expectValue('another offering: field', FIELDS, 'patient_offering_id');
    await flow.expect(409, 'an expired bought offering', 'POST', treatments, {
      name: 'X',
      patient_offering_id: chetanExpired,
    });
    flow.expectValue('expired: why', REASON, 'offering_expired');
    await flow.expect(200, 'a session spent from the bought offering', 'POST', treatments, {
      name: 'Hydrafacial',
      appointment_id: chetanVisit,
      patient_offering_id: chetanBought,
      doctor_membership_id: doctor,
      body_parts: ['face', 'neck'],
    });
    firstSession = flow.last('.data.id');
    flow.expectValue(
      'spent: trt_, its offering, number 1, billed (TR7, TR13)',
      '[(.data.id | startswith("trt_")), .data.offering_id, .data.session_number, .data.is_billed, .data.status, (.data.latest_check_in | tostring)] | map(tostring) | join(",")',
      `true,${hydrafacial},1,true,done,null`,
    );
    flow.expectEqual('one session spent', await sessionsUsed(chetanBought), '1');
    await flow.expect(
      200,
      "Chetan's file after the first session",
      'GET',
      `/app/patients/${chetanFile}`,
    );
    flow.expectValue('the first session converts (P4)', '.data.conversion', 'converted');
    await flow.expect(200, 'a second spent session', 'POST', treatments, {
      name: 'Hydrafacial',
      patient_offering_id: chetanBought,
    });
    const secondSession = flow.last('.data.id');
    flow.expectValue('second: number 2', '.data.session_number', 2);
    await flow.expect(409, 'none left (TR7)', 'POST', treatments, {
      name: 'Hydrafacial',
      patient_offering_id: chetanBought,
    });
    flow.expectValue('used up: why', REASON, 'offering_used_up');
    await flow.expect(200, 'a session to bill after the visit', 'POST', treatments, {
      name: 'Peel',
      offering_id: peel,
      template: 'physio',
      therapist_membership_id: therapist,
      doctor_membership_id: doctor,
      parameters: { region: 'lower back' },
      aftercare_call: 'in_two_days',
      session_number: 3,
    });
    const peelSession = flow.last('.data.id');
    flow.expectValue(
      'not billed yet (TR13)',
      '[.data.is_billed, .data.session_number, .data.parameters.region, .data.aftercare_call] | map(tostring) | join(",")',
      'false,3,lower back,in_two_days',
    );
    await flow.expect(200, 'a session with no offering', 'POST', treatments, {
      name: 'Advice only',
    });
    const plainSession = flow.last('.data.id');
    flow.expectValue('no offering: nothing to bill', '.data.is_billed | tostring', 'null');
    await flow.expect(400, 'thirteen body parts', 'POST', treatments, {
      name: 'X',
      body_parts: [
        'face',
        'upper_lip',
        'chin',
        'neck',
        'scalp',
        'hair',
        'chest',
        'back',
        'underarm',
        'arms',
        'hands',
        'legs',
        'body',
      ],
    });
    await flow.expect(
      400,
      "a linked session's number (TR7)",
      'PATCH',
      `${treatments}/${firstSession}`,
      {
        session_number: 5,
      },
    );
    flow.expectValue('linked number: field', FIELDS, 'session_number');
    await flow.expect(
      400,
      "a linked session's offering",
      'PATCH',
      `${treatments}/${firstSession}`,
      {
        offering_id: peel,
      },
    );
    flow.expectValue('linked offering: field', FIELDS, 'offering_id');
    await flow.expect(
      400,
      "the bought offering can't be changed",
      'PATCH',
      `${treatments}/${firstSession}`,
      { patient_offering_id: chetanBought },
    );
    await flow.expect(200, "a linked session's remark", 'PATCH', `${treatments}/${firstSession}`, {
      remark: 'Mild redness',
    });
    await flow.expect(
      200,
      "an unlinked session's number",
      'PATCH',
      `${treatments}/${peelSession}`,
      {
        session_number: 4,
      },
    );
    await flow.expect(
      400,
      'a reverse without a reason',
      'POST',
      `${treatments}/${secondSession}/reverse`,
      {},
    );
    await flow.expect(
      200,
      'reverse the second session (TR6)',
      'POST',
      `${treatments}/${secondSession}/reverse`,
      { reason: 'Wrong patient' },
    );
    flow.expectValue(
      'reversed: status, reason, link cleared, stamped',
      '[.data.status, .data.reversed_reason, (.data.patient_offering_id | tostring), (.data.reversed_at != null), (.data.is_billed | tostring)] | map(tostring) | join(",")',
      'reversed,Wrong patient,null,true,null',
    );
    flow.expectEqual('the session given back', await sessionsUsed(chetanBought), '1');
    await flow.expect(409, 'reverse twice', 'POST', `${treatments}/${secondSession}/reverse`, {
      reason: 'Again',
    });
    flow.expectValue('twice: why', REASON, 'transition_not_allowed');
    await flow.expect(409, 'change a reversed session', 'PATCH', `${treatments}/${secondSession}`, {
      remark: 'x',
    });
    flow.expectValue('reversed: why', REASON, 'treatment_reversed');
    await flow.expect(200, 'the given-back session spent again', 'POST', treatments, {
      name: 'Hydrafacial',
      patient_offering_id: chetanBought,
    });
    const thirdSession = flow.last('.data.id');
    flow.expectValue('again: number 2', '.data.session_number', 2);
    await flow.expect(200, "Chetan's sessions", 'GET', treatments);
    flow.expectValue(
      'five, newest first',
      '[.data[].id] | join(",")',
      [thirdSession, plainSession, peelSession, secondSession, firstSession].join(','),
    );
    await flow.expect(200, 'not billed', 'GET', `${treatments}?is_billed=false`);
    flow.expectValue('not billed: the peel', '[.data[].id] | join(",")', peelSession);
    await flow.expect(200, 'billed', 'GET', `${treatments}?is_billed=true`);
    flow.expectValue(
      'billed: the two spent',
      '[.data[].id] | join(",")',
      `${thirdSession},${firstSession}`,
    );
    await flow.expect(200, 'reversed', 'GET', `${treatments}?status=reversed`);
    flow.expectValue('reversed: the second', '[.data[].id] | join(",")', secondSession);
    await flow.expect(
      200,
      'performed today',
      'GET',
      `${treatments}?performed_from=${today}&performed_to=${today}&q=hydra`,
    );
    flow.expectValue("today's Hydrafacials", '.data | length', 3);
    await flow.expect(
      200,
      'performed tomorrow on',
      'GET',
      `${treatments}?performed_from=${tomorrow}`,
    );
    flow.expectValue('none tomorrow', '.data | length', 0);
    await flow.expect(
      200,
      "every patient's — a therapist's sessions (route 45)",
      'GET',
      `/app/patient-treatments?therapist_membership_id=${therapist}&patient_id=${chetanFile}`,
    );
    flow.expectValue("the therapist's: the peel", '[.data[].id] | join(",")', peelSession);
    await flow.expect(
      200,
      'the path wins over ?patient_id= (TR3)',
      'GET',
      `${treatments}?patient_id=${ashaFile}`,
    );
    flow.expectValue("path wins: Chetan's five", '.data | length', 5);
    await flow.expect(
      404,
      'a session under another patient',
      'GET',
      `/app/patients/${ashaFile}/treatments/${firstSession}`,
    );
    await flow.expect(404, 'an unknown session', 'GET', `${treatments}/${NOWHERE_TREATMENT}`);
    await flow.expect(
      404,
      'no delete (TR6)',
      'DELETE',
      `${treatments}/${firstSession}?${DELETE_REASON}`,
    );
    await flow.expect(
      200,
      "the contact's activity",
      'GET',
      `/app/contacts/${chetan}/activities?type=system&limit=50`,
    );
    flow.expectValue(
      'recorded and reversed entries',
      '[.data[] | select(.patient_treatment_id != null) | .body | split(":")[0]] | unique | join(",")',
      'Treatment recorded,Treatment reversed',
    );
    flow.as('front_desk');
    await flow.expect(200, 'the front desk reads sessions', 'GET', treatments);
    await flow.expect(403, 'the front desk records none', 'POST', treatments, { name: 'X' });
    flow.as('therapist');
    await flow.expect(
      200,
      'a therapist records a session',
      'POST',
      `/app/patients/${ashaFile}/treatments`,
      { name: 'Hydrafacial', patient_offering_id: ashaBought },
    );
    const ashaSession = flow.last('.data.id');
    flow.as('counsellor');
    await flow.expect(
      403,
      'a counsellor reverses none',
      'POST',
      `/app/patients/${ashaFile}/treatments/${ashaSession}/reverse`,
      { reason: 'x' },
    );
    flow.as('marketing');
    await flow.expect(403, 'marketing reads no sessions', 'GET', '/app/patient-treatments');
  });

  it('7.I check-ins (routes 51–56, TR9, TR10)', async () => {
    flow.as('owner');
    const checkIns = `/app/patients/${chetanFile}/check-ins`;
    await flow.expect(200, 'a check-in after a session (TR9)', 'POST', checkIns, {
      feel: 'better',
      score: 8,
      patient_treatment_id: firstSession,
    });
    goodCheckIn = flow.last('.data.id');
    flow.expectValue(
      'after: chk_, context, today, no trend, no action needed',
      '[(.data.id | startswith("chk_")), .data.context, .data.check_in_date, (.data.score_change | tostring), .data.needs_action, (.data.actions | length)] | map(tostring) | join(",")',
      `true,After Hydrafacial,${today},null,false,0`,
    );
    flow.expectEqual('no call-back when well', await callBacks(goodCheckIn), '0');
    await flow.expect(200, 'a worse check-in with the next offerings (TR10)', 'POST', checkIns, {
      feel: 'worse',
      score: 3,
      appointment_id: chetanVisit,
      followed: 'partly',
      followed_note: 'Skipped the sunscreen',
      next_plan: 'Calm the skin',
      next_offering_ids: [peel, hydrafacial],
    });
    worseCheckIn = flow.last('.data.id');
    flow.expectValue(
      'worse: visit context, trend -5, needs action, planned',
      '[(.data.context | startswith("Visit · ")), .data.score_change, .data.needs_action, (.data.next_offering_ids | join("|"))] | map(tostring) | join(",")',
      `true,-5,true,${peel}|${hydrafacial}`,
    );
    flow.expectEqual('a call-back for the doctor (TR4)', await callBacks(worseCheckIn), '1');
    await flow.expect(200, 'an offering already planned is skipped', 'POST', checkIns, {
      feel: 'same',
      score: 6,
      context: 'Phone call',
      next_offering_ids: [peel],
    });
    sameCheckIn = flow.last('.data.id');
    flow.expectValue(
      'skipped: none planned, its context',
      '[(.data.next_offering_ids | length), .data.context, .data.score_change] | map(tostring) | join(",")',
      '0,Phone call,3',
    );
    await flow.expect(400, 'an inactive next offering', 'POST', checkIns, {
      feel: 'same',
      score: 5,
      next_offering_ids: [retiredOffering],
    });
    flow.expectValue('inactive: field', FIELDS, 'next_offering_ids');
    await flow.expect(400, 'eleven next offerings', 'POST', checkIns, {
      feel: 'same',
      score: 5,
      next_offering_ids: Array.from({ length: 11 }, (_, index) => `off_${index}`),
    });
    await flow.expect(400, 'a check-in tomorrow', 'POST', checkIns, {
      feel: 'same',
      score: 5,
      check_in_date: tomorrow,
    });
    flow.expectValue('tomorrow: field', FIELDS, 'check_in_date');
    await flow.expect(
      400,
      "another patient's session",
      'POST',
      `/app/patients/${ashaFile}/check-ins`,
      { feel: 'same', score: 5, patient_treatment_id: firstSession },
    );
    flow.expectValue("another's session: field", FIELDS, 'patient_treatment_id');
    await flow.expect(
      400,
      "another patient's visit",
      'POST',
      `/app/patients/${ashaFile}/check-ins`,
      { feel: 'same', score: 5, appointment_id: chetanVisit },
    );
    flow.expectValue("another's visit: field", FIELDS, 'appointment_id');
    await flow.expect(400, 'a score of 11', 'POST', checkIns, { feel: 'same', score: 11 });
    await flow.expect(
      400,
      'next offerings on a change (create only)',
      'PATCH',
      `${checkIns}/${sameCheckIn}`,
      { next_offering_ids: [hydrafacial] },
    );
    await flow.expect(
      200,
      "the plan has the check-in's offerings",
      'GET',
      `${checkIns}/${worseCheckIn}`,
    );
    flow.expectValue('read back from the plan', '.data.next_offering_ids | length', 2);
    await flow.expect(200, 'needs action', 'GET', `${checkIns}?needs_action=true`);
    flow.expectValue('needs action: the worse one', '[.data[].id] | join(",")', worseCheckIn);
    await flow.expect(200, 'feel filter (several)', 'GET', `${checkIns}?feel=worse,same`);
    flow.expectValue('worse and same', '.data | length', 2);
    await flow.expect(
      200,
      "a session's check-ins",
      'GET',
      `${checkIns}?patient_treatment_id=${firstSession}`,
    );
    flow.expectValue("the session's: the good one", '[.data[].id] | join(",")', goodCheckIn);
    await flow.expect(
      200,
      'date range',
      'GET',
      `${checkIns}?check_in_date_from=${today}&check_in_date_to=${today}`,
    );
    flow.expectValue("today's three", '.data | length', 3);
    await flow.expect(400, 'no q on check-ins', 'GET', `${checkIns}?q=x`);
  });

  it('7.K feedback actions (routes 63–64, TR12)', async () => {
    flow.as('owner');
    const checkIns = `/app/patients/${chetanFile}/check-ins`;
    const actions = `${checkIns}/${worseCheckIn}/actions`;
    await flow.expect(400, 'other without a note', 'POST', actions, { action: 'other' });
    flow.expectValue('no note: field', FIELDS, 'body.note');
    await flow.expect(400, 'an unknown action', 'POST', actions, { action: 'emailed' });
    await flow.expect(200, 'the doctor called', 'POST', actions, {
      action: 'doctor_called',
      note: 'Advised cold compress',
    });
    flow.expectValue(
      'logged: fba_, by a member, needs action off',
      '[(.data.actions[0].id | startswith("fba_")), .data.actions[0].action, (.data.actions[0].author_membership_id | startswith("mem_")), .data.needs_action] | map(tostring) | join(",")',
      'true,doctor_called,true,false',
    );
    await flow.expect(200, 'then a plan change', 'POST', actions, {
      action: 'other',
      note: 'Moved the peel out',
    });
    flow.expectValue('newest first', '[.data.actions[].action] | join(",")', 'other,doctor_called');
    await flow.expect(200, 'needs action, after the call', 'GET', `${checkIns}?needs_action=true`);
    flow.expectValue('none needs action', '.data | length', 0);
    await flow.expect(
      404,
      'an action under another patient',
      'POST',
      `/app/patients/${ashaFile}/check-ins/${worseCheckIn}/actions`,
      { action: 'doctor_called' },
    );
    await flow.expect(
      404,
      'an action on an unknown check-in',
      'POST',
      `${checkIns}/${NOWHERE_CHECK_IN}/actions`,
      { action: 'doctor_called' },
    );
    await flow.expect(200, 'a change that turns it on', 'PATCH', `${checkIns}/${sameCheckIn}`, {
      score: 2,
    });
    flow.expectValue('turned on: needs action', '.data.needs_action', true);
    flow.expectEqual('a call-back when it turns on', await callBacks(sameCheckIn), '1');
    await flow.expect(
      200,
      "the session's latest check-in",
      'GET',
      `/app/patients/${chetanFile}/treatments/${firstSession}`,
    );
    flow.expectValue(
      'latest check-in on the session (7.H.6)',
      '[.data.latest_check_in.id, .data.latest_check_in.feel, .data.latest_check_in.score] | map(tostring) | join(",")',
      `${goodCheckIn},better,8`,
    );
    await flow.expect(
      204,
      'delete a check-in',
      'DELETE',
      `${checkIns}/${goodCheckIn}?${DELETE_REASON}`,
    );
    await flow.expect(404, 'a deleted check-in', 'GET', `${checkIns}/${goodCheckIn}`);
    await flow.expect(
      404,
      'no action on a deleted check-in',
      'POST',
      `${checkIns}/${goodCheckIn}/actions`,
      { action: 'doctor_called' },
    );
    await flow.expect(200, 'restore it', 'POST', `${checkIns}/${goodCheckIn}/restore`);
    await flow.expect(409, 'restore a live one', 'POST', `${checkIns}/${goodCheckIn}/restore`);
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(
      404,
      'a check-in under another patient',
      'GET',
      `/app/patients/${ashaFile}/check-ins/${goodCheckIn}`,
    );
  });

  it('7.J reviews (routes 57–62, TR11)', async () => {
    flow.as('owner');
    const reviewVideoKey = await confirmedUpload('review.mp4', 'video/mp4', 8192);
    const reviews = `/app/patients/${chetanFile}/reviews`;
    await flow.expect(200, 'a Google review', 'POST', reviews, {
      source: 'google',
      rating: 5,
      text: 'Lovely staff',
      link: 'https://g.page/r/clinic',
    });
    const googleReview = flow.last('.data.id');
    flow.expectValue(
      'google: rev_, today, no action needed',
      '[(.data.id | startswith("rev_")), .data.review_date, .data.needs_action] | map(tostring) | join(",")',
      `true,${today},false`,
    );
    await flow.expect(400, 'a link that is not https (TR11)', 'POST', reviews, {
      source: 'google',
      link: 'http://g.page/r/clinic',
    });
    flow.expectValue('http: field', FIELDS, 'body.link');
    await flow.expect(400, 'an unconfirmed file', 'POST', reviews, {
      source: 'video',
      file_keys: ['organizations/none/uploads/v.mp4'],
    });
    flow.expectValue('unconfirmed: field', FIELDS, 'file_keys');
    await flow.expect(400, 'a review tomorrow', 'POST', reviews, {
      source: 'whatsapp',
      review_date: tomorrow,
    });
    flow.expectValue('tomorrow: field', FIELDS, 'review_date');
    await flow.expect(400, "another contact's visit", 'POST', `/app/patients/${ashaFile}/reviews`, {
      source: 'whatsapp',
      appointment_id: chetanVisit,
    });
    flow.expectValue("another's visit: field", FIELDS, 'appointment_id');
    await flow.expect(400, 'a rating of 6', 'POST', reviews, { source: 'google', rating: 6 });
    await flow.expect(200, 'a low video review', 'POST', reviews, {
      source: 'video',
      rating: 2,
      file_keys: [reviewVideoKey],
      appointment_id: chetanVisit,
      review_date: yesterday,
    });
    const lowReview = flow.last('.data.id');
    flow.expectValue(
      'low: needs action, the file',
      '[.data.needs_action, (.data.file_keys | length)] | map(tostring) | join(",")',
      'true,1',
    );
    flow.expectEqual('a call-back for the low rating (TR4)', await callBacks(lowReview), '1');
    await flow.expect(200, 'the reviews, newest first', 'GET', reviews);
    flow.expectValue(
      'newest review date first',
      '[.data[].id] | join(",")',
      `${googleReview},${lowReview}`,
    );
    await flow.expect(200, 'source filter (several)', 'GET', `${reviews}?source=video,instagram`);
    flow.expectValue('video only', '[.data[].id] | join(",")', lowReview);
    await flow.expect(200, 'needs action', 'GET', `${reviews}?needs_action=true`);
    flow.expectValue('needs action: the low one', '[.data[].id] | join(",")', lowReview);
    await flow.expect(200, 'date range', 'GET', `${reviews}?review_date_to=${yesterday}`);
    flow.expectValue('yesterday: the low one', '[.data[].id] | join(",")', lowReview);
    await flow.expect(200, 'replied on Google', 'POST', `${reviews}/${lowReview}/actions`, {
      action: 'replied_google',
    });
    flow.expectValue(
      'replied: needs action off',
      '[.data.needs_action, .data.actions[0].action] | map(tostring) | join(",")',
      'false,replied_google',
    );
    await flow.expect(200, 'a rating lowered to 1', 'PATCH', `${reviews}/${googleReview}`, {
      rating: 1,
    });
    flow.expectEqual('a call-back when it turns on', await callBacks(googleReview), '1');
    await flow.expect(400, 'a change to an http link', 'PATCH', `${reviews}/${googleReview}`, {
      link: 'ftp://x',
    });
    await flow.expect(
      204,
      'delete a review',
      'DELETE',
      `${reviews}/${googleReview}?${DELETE_REASON}`,
    );
    await flow.expect(
      404,
      'no action on a deleted review',
      'POST',
      `${reviews}/${googleReview}/actions`,
      { action: 'replied_google' },
    );
    await flow.expect(200, 'restore it', 'POST', `${reviews}/${googleReview}/restore`);
    await flow.expect(
      404,
      'a review under another patient',
      'GET',
      `/app/patients/${ashaFile}/reviews/${lowReview}`,
    );
    await flow.expect(
      200,
      "the contact's activity",
      'GET',
      `/app/contacts/${chetan}/activities?type=system&limit=50`,
    );
    flow.expectValue(
      'check-in and review entries',
      '[.data[] | select(.patient_check_in_id != null or .patient_review_id != null)] | length',
      5,
    );
    flow.as('marketing');
    await flow.expect(
      200,
      'marketing reads check-ins (patient:read)',
      'GET',
      `/app/patients/${chetanFile}/check-ins`,
    );
    await flow.expect(200, 'marketing reads reviews', 'GET', reviews);
    // D83 (4): Marketing logs reviews on their own codes — without changing the file.
    await flow.expect(200, 'marketing logs a review', 'POST', reviews, {
      source: 'instagram',
      rating: 4,
      text: 'Great results',
    });
    const marketingReview = flow.last('.data.id');
    await flow.expect(200, 'marketing changes it', 'PATCH', `${reviews}/${marketingReview}`, {
      rating: 5,
    });
    flow.expectValue('changed', '.data.rating', 5);
    await flow.expect(
      200,
      'marketing logs an action',
      'POST',
      `${reviews}/${marketingReview}/actions`,
      { action: 'replied_instagram' },
    );
    await flow.expect(
      204,
      'marketing deletes it',
      'DELETE',
      `${reviews}/${marketingReview}?reason=duplicate`,
    );
    await flow.expect(200, 'and restores it', 'POST', `${reviews}/${marketingReview}/restore`);
    await flow.expect(
      403,
      'marketing still changes no file (patient:update)',
      'PATCH',
      `/app/patients/${chetanFile}`,
      { status: 'vip' },
    );
    flow.as('front_desk');
    await flow.expect(200, 'the front desk still logs reviews', 'POST', reviews, {
      source: 'google',
      rating: 5,
    });
    flow.as('accountant');
    await flow.expect(403, 'the accountant logs no review', 'POST', reviews, {
      source: 'google',
    });
    flow.expectValue('accountant: why', REASON, 'missing_permission');
    flow.as('pharmacist');
    await flow.expect(
      403,
      'the pharmacist logs no review (patient_review:create)',
      'POST',
      reviews,
      {
        source: 'google',
      },
    );
    await flow.expect(
      403,
      'the pharmacist logs no action (patient_review:update)',
      'POST',
      `${reviews}/${lowReview}/actions`,
      { action: 'replied_google' },
    );
  });

  it('7.L patient offerings (routes 65–67, PK4–PK6)', async () => {
    flow.as('owner');
    const todayInvoice = await invoiceOn(chetanFile, today);
    const sevenPack = await boughtOffering({
      patientFile: chetanFile,
      offering: peel,
      total: 7,
      validUntil: inAMonth,
      invoice: todayInvoice,
    });
    const singleSession = await boughtOffering({
      patientFile: chetanFile,
      offering: hydrafacial,
      total: 1,
      validUntil: inAMonth,
    });
    await getOperatorSql()`
      UPDATE app.patient_offerings SET valid_until = NULL WHERE public_id = ${singleSession}
    `;
    const bought = `/app/patients/${chetanFile}/offerings`;
    await flow.expect(200, 'what Chetan bought', 'GET', bought);
    flow.expectValue(
      'four, newest first',
      '[.data[].id] | join(",")',
      [singleSession, sevenPack, chetanExpired, chetanBought].join(','),
    );
    await flow.expect(200, 'a bought package', 'GET', `${bought}/${sevenPack}`);
    flow.expectValue(
      'package: poff_, name, sessions, active, the bill',
      '[(.data.id | startswith("poff_")), .data.offering_name, .data.sessions_total, .data.sessions_left, .data.is_package, .data.status, .data.invoice_id] | map(tostring) | join(",")',
      `true,Peel ${S},7,7,true,active,${todayInvoice}`,
    );
    await flow.expect(200, 'the used-up one', 'GET', `${bought}/${chetanBought}`);
    flow.expectValue(
      'used up: 2 of 2',
      '[.data.sessions_used, .data.sessions_left, .data.status] | map(tostring) | join(",")',
      '2,0,used_up',
    );
    await flow.expect(200, 'active', 'GET', `${bought}?status=active`);
    flow.expectValue(
      'active: the pack and the single',
      '[.data[].id] | join(",")',
      `${singleSession},${sevenPack}`,
    );
    await flow.expect(
      200,
      'used up or expired (several)',
      'GET',
      `${bought}?status=used_up,expired`,
    );
    flow.expectValue('used up and expired', '[.data[] | .status] | join(",")', 'expired,used_up');
    await flow.expect(
      200,
      'single sessions (is_package=false)',
      'GET',
      `${bought}?is_package=false`,
    );
    flow.expectValue('the single', '[.data[].id] | join(",")', singleSession);
    await flow.expect(
      200,
      'the packages tab',
      'GET',
      `${bought}?is_package=true&offering_id=${hydrafacial}`,
    );
    flow.expectValue('Hydrafacial packages', '.data | length', 2);
    await flow.expect(200, 'by expiry, no expiry last', 'GET', `${bought}?sort=valid_until`);
    flow.expectValue(
      'expiry order',
      '[.data[].id] | join(",")',
      [chetanExpired, chetanBought, sevenPack, singleSession].join(','),
    );
    await flow.expect(400, 'below what was spent (PK6)', 'PATCH', `${bought}/${chetanBought}`, {
      sessions_total: 1,
    });
    flow.expectValue('below spent: field', FIELDS, 'sessions_total');
    await flow.expect(400, 'a thousand sessions', 'PATCH', `${bought}/${sevenPack}`, {
      sessions_total: 1000,
    });
    await flow.expect(400, 'expiring before the bill', 'PATCH', `${bought}/${sevenPack}`, {
      valid_until: yesterday,
    });
    flow.expectValue('before the bill: field', FIELDS, 'valid_until');
    await flow.expect(200, 'no expiry', 'PATCH', `${bought}/${sevenPack}`, { valid_until: null });
    flow.expectValue('no expiry: null', '.data.valid_until | tostring', 'null');
    await flow.expect(200, 'two more sessions', 'PATCH', `${bought}/${chetanBought}`, {
      sessions_total: 4,
    });
    flow.expectValue(
      'active again, two left',
      '[.data.status, .data.sessions_left] | map(tostring) | join(",")',
      'active,2',
    );
    await flow.expect(200, 'extend the expired one', 'PATCH', `${bought}/${chetanExpired}`, {
      valid_until: inAMonth,
    });
    flow.expectValue('extended: active', '.data.status', 'active');
    await flow.expect(
      200,
      'a session spent from the pack',
      'POST',
      `/app/patients/${chetanFile}/treatments`,
      { name: 'Peel', patient_offering_id: sevenPack },
    );
    flow.expectValue(
      'spent: session 1 of the pack',
      '[.data.session_number, .data.patient_offering_id] | map(tostring) | join(",")',
      `1,${sevenPack}`,
    );
    await flow.expect(
      404,
      'under another patient',
      'GET',
      `/app/patients/${ashaFile}/offerings/${sevenPack}`,
    );
    await flow.expect(404, 'no create (PK4)', 'POST', bought, {
      offering_id: peel,
      sessions_total: 1,
    });
    await flow.expect(404, 'no delete (PK6)', 'DELETE', `${bought}/${sevenPack}?${DELETE_REASON}`);
    flow.as('front_desk');
    await flow.expect(
      200,
      'the front desk changes one (payment:update)',
      'PATCH',
      `${bought}/${singleSession}`,
      { sessions_total: 2 },
    );
    flow.as('doctor');
    await flow.expect(200, 'a doctor reads them', 'GET', bought);
    await flow.expect(403, 'a doctor changes none', 'PATCH', `${bought}/${singleSession}`, {
      sessions_total: 3,
    });
  });

  it('7.M the plan (routes 68–73, PK7–PK10)', async () => {
    flow.as('owner');
    await flow.expect(200, 'offering Consult', 'POST', '/app/offerings', {
      name: `Consult ${S}`,
      price: 500,
      min_price: 400,
    });
    const consult = flow.last('.data.id');
    const plan = `/app/patients/${chetanFile}/offering-suggestions`;
    await flow.expect(200, "Chetan's plan (a check-in planned two)", 'GET', plan);
    flow.expectValue(
      'two from the check-in',
      '[.data[] | .source_label | startswith("Check-in · ")] | map(tostring) | join(",")',
      'true,true',
    );
    const peelPlanned = flow.last(`[.data[] | select(.offering_id == "${peel}") | .id] | first`);
    const hydrafacialPlanned = flow.last(
      `[.data[] | select(.offering_id == "${hydrafacial}") | .id] | first`,
    );
    flow.expectValue("the plan's total (PK9)", '.meta.plan_total', 6500);
    await flow.expect(409, 'the same offering again (PK9)', 'POST', plan, {
      offering_id: hydrafacial,
    });
    flow.expectValue('again: why', REASON, 'suggestion_exists');
    await flow.expect(400, 'an inactive offering (O13)', 'POST', plan, {
      offering_id: retiredOffering,
    });
    flow.expectValue('inactive: field', FIELDS, 'offering_id');
    await flow.expect(
      400,
      "another contact's visit",
      'POST',
      `/app/patients/${ashaFile}/offering-suggestions`,
      { offering_id: consult, appointment_id: chetanVisit },
    );
    flow.expectValue("another's visit: field", FIELDS, 'appointment_id');
    await flow.expect(400, 'a quantity of 100', 'POST', plan, {
      offering_id: consult,
      quantity: 100,
    });
    await flow.expect(200, 'plan a consult at the visit, below its lowest price', 'POST', plan, {
      offering_id: consult,
      quantity: 2,
      price: 700,
      appointment_id: chetanVisit,
      reason: 'Review the peel',
    });
    const consultPlanned = flow.last('.data.id');
    flow.expectValue(
      "consult: osug_, the visit's label, below lowest, by a member, nothing invoiced",
      '[(.data.id | startswith("osug_")), (.data.source_label | startswith("Appt #")), (.data.source_label | endswith(" · Consultation")), .data.is_below_lowest_price, (.data.suggested_by_membership_id | startswith("mem_")), .data.invoiced_quantity, .data.is_fully_invoiced, .data.offering_name] | map(tostring) | join(",")',
      `true,true,true,true,true,0,false,Consult ${S}`,
    );
    await flow.expect(200, 'the plan with the consult', 'GET', plan);
    flow.expectValue(
      'three rows, total with its price',
      '[(.data | length), .meta.plan_total] | map(tostring) | join(",")',
      '3,7200',
    );
    await flow.expect(
      200,
      "a check-in's rows",
      'GET',
      `${plan}?patient_check_in_id=${worseCheckIn}`,
    );
    flow.expectValue("the check-in's two", '.data | length', 2);
    await flow.expect(
      200,
      "a visit's rows (Plan ready)",
      'GET',
      `${plan}?appointment_id=${chetanVisit}`,
    );
    flow.expectValue("the visit's three", '.data | length', 3);
    await flow.expect(200, 'decline the Hydrafacial', 'PATCH', `${plan}/${hydrafacialPlanned}`, {
      status: 'declined',
    });
    await flow.expect(200, 'planned only', 'GET', `${plan}?status=planned,accepted`);
    flow.expectValue(
      'planned: two, total without it',
      '[(.data | length), .meta.plan_total] | map(tostring) | join(",")',
      '2,3200',
    );
    await flow.expect(200, 'the Hydrafacial again, after the decline', 'POST', plan, {
      offering_id: hydrafacial,
      status: 'next_time',
    });
    const hydrafacialAgain = flow.last('.data.id');
    flow.expectValue("again: the patient file's label", '.data.source_label', 'Patient file');
    await flow.expect(
      409,
      'the declined one back while another holds it',
      'PATCH',
      `${plan}/${hydrafacialPlanned}`,
      { status: 'planned' },
    );
    flow.expectValue('back: why', REASON, 'suggestion_exists');
    await flow.expect(400, "the offering can't change", 'PATCH', `${plan}/${consultPlanned}`, {
      offering_id: peel,
    });
    await flow.expect(200, 'change quantity and price', 'PATCH', `${plan}/${consultPlanned}`, {
      quantity: 1,
      price: null,
      status: 'accepted',
    });
    flow.expectValue(
      'changed: no longer below',
      '[.data.quantity, (.data.price | tostring), .data.status, .data.is_below_lowest_price] | map(tostring) | join(",")',
      '1,null,accepted,false',
    );
    await flow.expect(
      400,
      'remove without a note for other',
      'DELETE',
      `${plan}/${hydrafacialAgain}?reason=other`,
    );
    await flow.expect(
      204,
      'remove the second Hydrafacial',
      'DELETE',
      `${plan}/${hydrafacialAgain}?reason=duplicate`,
    );
    await flow.expect(404, 'a removed row', 'GET', `${plan}/${hydrafacialAgain}`);
    await flow.expect(200, 'the declined one back now', 'PATCH', `${plan}/${hydrafacialPlanned}`, {
      status: 'planned',
    });
    await flow.expect(
      409,
      'restore while it is held again (PK9)',
      'POST',
      `${plan}/${hydrafacialAgain}/restore`,
    );
    flow.expectValue('restore held: why', REASON, 'suggestion_exists');
    await flow.expect(409, 'restore a live row', 'POST', `${plan}/${peelPlanned}/restore`);
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(
      404,
      'a row under another patient',
      'GET',
      `/app/patients/${ashaFile}/offering-suggestions/${peelPlanned}`,
    );
    flow.as('marketing');
    await flow.expect(200, 'marketing reads the plan', 'GET', plan);
    flow.as('pharmacist');
    await flow.expect(403, 'the pharmacist plans nothing', 'POST', plan, { offering_id: consult });
  });
});
