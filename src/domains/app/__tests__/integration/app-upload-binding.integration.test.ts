import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery, withOperatorTransaction } from '@/tests/helpers/operator-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { runAppRecordPurgeJob } from '@/domains/app/workers/app-record-purge.processor.js';
import { tombstoneUploadsOfMissingRecords } from '@/domains/upload/upload.repository.js';
import { UPLOAD_BOUND_RECORD_TABLES } from '@/domains/upload/upload-bound-records.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * An uploaded file belongs to the record it was first attached to (C-2): a second record cannot take
 * the same key, a link is signed only for the record the key is bound to, and a purged record's files
 * are tombstoned so the upload retention removes their objects (G2-5).
 */
describe('Upload binding — integration (C-2, G2-5)', () => {
  const S = String(Date.now());

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let patient = '';
  let vesu = '';

  /** A confirmed upload of the fixture organization, unbound; answers its key. */
  async function confirmedUpload(name: string, mimeType = 'application/pdf'): Promise<string> {
    const key = `organizations/${fixture.organization.publicId}/uploads/${S}-${name}`;
    await operatorQuery`
      INSERT INTO upload.uploads (public_id, user_id, organization_id, file_name, file_key, mime_type,
        file_size, bucket, status, uploaded_at)
      VALUES (${`upl_${S}${name.replace(/\W/g, '')}`.slice(0, 28)}, ${fixture.members.owner.userId},
        ${fixture.organization.id}, ${name}, ${key}, ${mimeType}, 1024, 'local', 'UPLOADED', now())
    `;
    return key;
  }

  /** Which record a key is bound to, as `resource:public id`, or `none`. */
  async function boundTo(key: string): Promise<string> {
    const [row] = await operatorQuery<{ resource: string | null; id: string | null }[]>`
      SELECT bound_resource AS resource, bound_public_id AS id FROM upload.uploads WHERE file_key = ${key}
    `;
    return row?.resource ? `${row.resource}:${row.id}` : 'none';
  }

  /** Clears the binding of `keys` — the state every upload v9.4.1 attached is in. */
  async function unbind(...keys: string[]): Promise<void> {
    await operatorQuery`
      UPDATE upload.uploads SET bound_resource = NULL, bound_public_id = NULL WHERE file_key = ANY(${keys})
    `;
  }

  /** Runs the binding backfill migration again, statement by statement in one transaction. */
  async function runBindingBackfill(): Promise<void> {
    const contents = await readFile(
      resolve(process.cwd(), 'migrations/20261104043912_upload_record_binding_backfill.sql'),
      'utf8',
    );
    const statements = contents
      .split(/\n--> statement-breakpoint\s*\n?/g)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    await withOperatorTransaction(async (transaction) => {
      for (const statement of statements) await transaction.unsafe(statement);
    });
  }

  /** A report on the fixture patient holding `fileKeys`; answers its id. */
  async function report(name: string, fileKeys: string[]): Promise<string> {
    await flow.expect(200, `report ${name}`, 'POST', `/app/patients/${patient}/reports`, {
      name,
      type: 'lab',
      report_date: calendarDay(fixture, 0),
      file_keys: fileKeys,
    });
    return flow.last('.data.id');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    vesu = fixture.branches.vesu;
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Rhea',
      last_name: `u${S}`,
      phones: [{ phone: `+918${S.slice(-7)}41`, is_primary: true }],
    });
    await flow.expect(200, 'her file', 'POST', '/app/patients', {
      contact_id: flow.last('.data.id'),
      home_branch_id: vesu,
    });
    patient = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('C-2: the first attach binds the file to the report; another report is refused', async () => {
    const reports = `/app/patients/${patient}/reports`;
    const key = await confirmedUpload('first.pdf');
    await flow.expect(200, 'a report with its file', 'POST', reports, {
      name: 'CBC',
      type: 'lab',
      report_date: calendarDay(fixture, 0),
      file_keys: [key],
    });
    const report = flow.last('.data.id');
    expect(await boundTo(key)).toBe(`patient_report:${report}`);

    await flow.expect(400, 'the same file on another report', 'POST', reports, {
      name: 'Second',
      type: 'lab',
      report_date: calendarDay(fixture, 0),
      file_keys: [key],
    });
    flow.expectValue('the refusal names the field', '.error.detail | test("attached")', 'true');
    const [copies] = await operatorQuery<{ n: number }[]>`
      SELECT count(*)::int AS n FROM app.patient_reports WHERE ${key} = ANY(file_keys) AND deleted_at IS NULL
    `;
    expect(copies?.n, 'the refused report was not written').toBe(1);
  });

  it('C-2: a link is signed for the report the file is bound to, not for another', async () => {
    const reports = `/app/patients/${patient}/reports`;
    const key = await confirmedUpload('linked.pdf');
    await flow.expect(200, 'a report', 'POST', reports, {
      name: 'Scan',
      type: 'scan',
      report_date: calendarDay(fixture, 0),
      file_keys: [key],
    });
    const report = flow.last('.data.id');
    await flow.expect(200, 'the report reads its file', 'GET', `${reports}/${report}`);
    flow.expectValue('it has a link', '.data.files[0].file_url != null', 'true');

    await operatorQuery`UPDATE upload.uploads SET bound_public_id = 'rpt_elsewhere000000000000' WHERE file_key = ${key}`;
    await flow.expect(200, 'the same report again', 'GET', `${reports}/${report}`);
    flow.expectValue('no link for a file bound elsewhere', '.data.files[0].file_url', 'null');
    await operatorQuery`UPDATE upload.uploads SET bound_public_id = ${report} WHERE file_key = ${key}`;
  });

  it('C-2: an update binds the new file to the report, and another report cannot take it', async () => {
    const reports = `/app/patients/${patient}/reports`;
    const first = await confirmedUpload('update-a.pdf');
    const added = await confirmedUpload('update-b.pdf');
    await flow.expect(200, 'a report', 'POST', reports, {
      name: 'Panel',
      type: 'lab',
      report_date: calendarDay(fixture, 0),
      file_keys: [first],
    });
    const report = flow.last('.data.id');
    await flow.expect(200, 'it takes a second file', 'PATCH', `${reports}/${report}`, {
      file_keys: [first, added],
    });
    expect(await boundTo(added)).toBe(`patient_report:${report}`);

    await flow.expect(200, 'another report', 'POST', reports, {
      name: 'Other',
      type: 'lab',
      report_date: calendarDay(fixture, 0),
      file_keys: [],
    });
    const other = flow.last('.data.id');
    await flow.expect(400, 'the bound file is refused there', 'PATCH', `${reports}/${other}`, {
      file_keys: [added],
    });
  });

  it('C-2: two reports racing for one unbound file — exactly one binds it', async () => {
    const reports = `/app/patients/${patient}/reports`;
    const contested = await confirmedUpload('race.pdf');
    const body = (name: string) => ({
      name,
      type: 'lab',
      report_date: calendarDay(fixture, 0),
      file_keys: [contested],
    });
    const answers = await Promise.all(
      ['Race A', 'Race B'].map((name) =>
        new AppFlow(app, fixture).as('owner').call('POST', reports, body(name)),
      ),
    );
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 400]);
    expect((await boundTo(contested)).startsWith('patient_report:')).toBe(true);
  });

  it('C-2: a receipt binds its slip; another receipt is refused', async () => {
    await flow.expect(200, 'a contact to pay', 'POST', '/app/contacts', {
      first_name: 'Pay',
      last_name: `s${S}`,
      phones: [{ phone: `+917${S.slice(-7)}42`, is_primary: true }],
    });
    const contact = flow.last('.data.id');
    const slip = await confirmedUpload('slip.pdf');
    const receipt = {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: contact,
      splits: [{ mode: 'cash', amount: 100 }],
      attachment_keys: [slip],
    };
    await flow.expect(200, 'a receipt with its slip', 'POST', '/app/payments', receipt);
    const payment = flow.last('.data.id');
    expect(await boundTo(slip)).toBe(`payment:${payment}`);
    await flow.expect(400, 'the slip on another receipt', 'POST', '/app/payments', receipt);
  });

  it('G2-5: a purged review’s file is tombstoned; a kept review’s file is not', async () => {
    const reviews = `/app/patients/${patient}/reviews`;
    const gone = await confirmedUpload('review-gone.jpg', 'image/jpeg');
    const kept = await confirmedUpload('review-kept.jpg', 'image/jpeg');
    const review = { source: 'google', rating: 5, review_date: calendarDay(fixture, 0) };
    await flow.expect(200, 'a review with its file', 'POST', reviews, {
      ...review,
      file_keys: [gone],
    });
    const reviewGone = flow.last('.data.id');
    await flow.expect(200, 'a second review, kept', 'POST', reviews, {
      ...review,
      file_keys: [kept],
    });
    const reviewKept = flow.last('.data.id');
    expect(await boundTo(gone)).toBe(`patient_review:${reviewGone}`);

    // The review's log entry names it (a NO ACTION link), so the purge waits until that entry is gone.
    await operatorQuery`
      DELETE FROM app.contact_activities
      WHERE patient_review_id = (SELECT id FROM app.patient_reviews WHERE public_id = ${reviewGone})
    `;
    await flow.expect(
      204,
      'the review is deleted',
      'DELETE',
      `${reviews}/${reviewGone}?reason=mistake`,
    );
    await operatorQuery`
      UPDATE app.patient_reviews SET deleted_at = now() - interval '8 days' WHERE public_id = ${reviewGone}
    `;
    await runGlobalRetentionWorkerJob((handle) => runAppRecordPurgeJob(handle));
    const [still] = await operatorQuery<{ n: number }[]>`
      SELECT count(*)::int AS n FROM app.patient_reviews WHERE public_id = ${reviewGone}
    `;
    expect(still?.n, 'the purge erased the review').toBe(0);

    const swept = await runGlobalRetentionWorkerJob((handle) =>
      tombstoneUploadsOfMissingRecords(handle, UPLOAD_BOUND_RECORD_TABLES),
    );
    expect(swept, 'the orphaned file was tombstoned').toBeGreaterThanOrEqual(1);
    const [goneRow] = await operatorQuery<{ tombstoned: boolean }[]>`
      SELECT deleted_at IS NOT NULL AS tombstoned FROM upload.uploads WHERE file_key = ${gone}
    `;
    expect(goneRow?.tombstoned).toBe(true);
    const [keptRow] = await operatorQuery<{ tombstoned: boolean }[]>`
      SELECT deleted_at IS NOT NULL AS tombstoned FROM upload.uploads WHERE file_key = ${kept}
    `;
    expect(keptRow?.tombstoned, 'a live review keeps its file').toBe(false);
    expect(await boundTo(kept)).toBe(`patient_review:${reviewKept}`);
  });

  it('backfill: a file attached before the binding existed gets its link back; a loose file stays unbound', async () => {
    const reports = `/app/patients/${patient}/reports`;
    const attached = await confirmedUpload('before-binding.pdf');
    const loose = await confirmedUpload('never-attached.pdf');
    const scan = await report('Old scan', [attached]);
    await unbind(attached, loose);
    await flow.expect(200, 'the pre-release report', 'GET', `${reports}/${scan}`);
    flow.expectValue('unbound: no link (the release blocker)', '.data.files[0].file_url', 'null');

    await runBindingBackfill();
    expect(await boundTo(attached)).toBe(`patient_report:${scan}`);
    expect(await boundTo(loose), 'no record holds it').toBe('none');
    await flow.expect(200, 'the report after the backfill', 'GET', `${reports}/${scan}`);
    flow.expectValue('it has its link again', '.data.files[0].file_url != null', 'true');
    flow.expectValue('and its name', '.data.files[0].file_name', 'before-binding.pdf');

    await runBindingBackfill();
    expect(await boundTo(attached), 'a re-run changes nothing').toBe(`patient_report:${scan}`);
  });

  it('backfill: a key a deleted and a live record both hold binds to the live one; a bound key stays put', async () => {
    const reports = `/app/patients/${patient}/reports`;
    const shared = await confirmedUpload('shared.pdf');
    const elsewhere = await confirmedUpload('bound-elsewhere.pdf');
    const deleted = await report('Deleted first', [shared]);
    const live = await report('Live second', []);
    await operatorQuery`UPDATE app.patient_reports SET file_keys = ARRAY[${shared}, ${elsewhere}] WHERE public_id = ${live}`;
    await flow.expect(
      204,
      'the first report is deleted',
      'DELETE',
      `${reports}/${deleted}?reason=mistake`,
    );
    await unbind(shared);
    await operatorQuery`UPDATE upload.uploads SET bound_resource = 'payment', bound_public_id = 'pay_elsewhere0000000000000' WHERE file_key = ${elsewhere}`;

    await runBindingBackfill();
    expect(await boundTo(shared), 'the live report wins over the deleted one').toBe(
      `patient_report:${live}`,
    );
    expect(await boundTo(elsewhere), 'an existing binding is never moved').toBe(
      'payment:pay_elsewhere0000000000000',
    );
  });

  it('previous release: a record it writes binds its files on the write (expand trigger)', async () => {
    const reports = `/app/patients/${patient}/reports`;
    const updated = await confirmedUpload('old-app-update.pdf');
    const inserted = await confirmedUpload('old-app-insert.pdf');
    const taken = await confirmedUpload('old-app-taken.pdf');
    const owner = await report('Owner', [taken]);
    const panel = await report('Old app panel', []);

    // v9.4.1's PATCH writes file_keys and binds nothing
    await operatorQuery`UPDATE app.patient_reports SET file_keys = ARRAY[${updated}, ${taken}] WHERE public_id = ${panel}`;
    expect(await boundTo(updated)).toBe(`patient_report:${panel}`);
    expect(await boundTo(taken), 'a key bound to another record is left alone').toBe(
      `patient_report:${owner}`,
    );
    await flow.expect(200, 'the report the old app changed', 'GET', `${reports}/${panel}`);
    flow.expectValue(
      'its own file has a link, the other record’s has none',
      '[.data.files[] | .file_url != null] | map(tostring) | join(",")',
      'true,false',
    );

    // v9.4.1's POST inserts the record and binds nothing
    const copy = generatePublicId('patientReport');
    await operatorQuery`
      INSERT INTO app.patient_reports
      SELECT (jsonb_populate_record(NULL::app.patient_reports, to_jsonb(report) || jsonb_build_object(
        'id', nextval(pg_get_serial_sequence('app.patient_reports', 'id')),
        'public_id', ${copy}::text,
        'file_keys', ARRAY[${inserted}]::text[]))).*
      FROM app.patient_reports AS report WHERE report.public_id = ${panel}
    `;
    expect(await boundTo(inserted)).toBe(`patient_report:${copy}`);
  });
});
