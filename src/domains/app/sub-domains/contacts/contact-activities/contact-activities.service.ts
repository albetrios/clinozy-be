import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberReference } from '@/domains/app/app-member-reference.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordReference } from '@/domains/app/base-record.types.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contact_message_templates } from '@/domains/app/sub-domains/contacts/contact-message-templates/contact-message-templates.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import { patient_prescriptions } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.schema.js';
import { patient_offerings } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { patient_clinical_notes } from '@/domains/app/sub-domains/patients/patient-clinical-notes/patient-clinical-notes.schema.js';
import { patient_images } from '@/domains/app/sub-domains/patients/patient-images/patient-images.schema.js';
import { patient_reports } from '@/domains/app/sub-domains/patients/patient-reports/patient-reports.schema.js';
import {
  CONTACT_ACTIVITY_DELIVERY_STATUS,
  type ContactActivityLinkColumn,
} from './contact-activities.constants.js';
import type { ContactActivitiesRepository } from './contact-activities.repository.js';
import { createContactActivitiesRules } from './contact-activities.rules.js';
import { contact_activities } from './contact-activities.schema.js';
import { serializeContactActivity } from './contact-activities.serializer.js';
import type { ContactActivityOutput } from './contact-activities.types.js';
import {
  refuseContactActivityUpdate,
  refuseGenericContactActivity,
  validateAddContactNote,
  validateListContactActivitiesQuery,
  validateLogContactCall,
  validateSendContactMessage,
} from './contact-activities.validator.js';

/** The twelve record links (M5) — each a reference to today's table (D63). */
const LINK_REFERENCES: readonly (BaseRecordReference & { field: ContactActivityLinkColumn })[] = [
  { field: 'appointment_id', table: appointments, label: 'appointment' },
  { field: 'invoice_id', table: invoices, label: 'invoice' },
  { field: 'payment_id', table: payments, label: 'payment' },
  { field: 'patient_prescription_id', table: patient_prescriptions, label: 'prescription' },
  { field: 'patient_offering_id', table: patient_offerings, label: 'patient offering' },
  { field: 'patient_review_id', table: patient_reviews, label: 'review' },
  { field: 'patient_check_in_id', table: patient_check_ins, label: 'check-in' },
  { field: 'task_id', table: tasks, label: 'task' },
  { field: 'patient_treatment_id', table: patient_treatments, label: 'treatment' },
  { field: 'patient_clinical_note_id', table: patient_clinical_notes, label: 'clinical note' },
  { field: 'patient_image_id', table: patient_images, label: 'image' },
  { field: 'patient_report_id', table: patient_reports, label: 'report' },
];

/**
 * A contact's activity stream (launch ROUTE #15, rebuilt at #130 — routes-final 4.C): list and read
 * the entries, send a WhatsApp or Instagram message, log a call, add a note, re-queue a failed
 * message, and one message to many contacts.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on the append-only `app.contact_activities`,
 *   nested under the contact (`contact_id` — a deleted or unknown contact is a 404); one named
 *   create per action (M12); the rules check and fill each entry and move the contact's activity
 *   times in the same transaction. Not branch-scoped — the stream is the person's (CT6).
 * - **Failure modes:** `NotFoundError('Contact activity')` / `('Contact')`; `ValidationError` for a
 *   bad body, a reference that is no live record here, more than one record link, a template of
 *   the other type, an unconfirmed upload or an answered entry of another contact; `ConflictError`
 *   (`transition_not_allowed`) for re-queuing an entry that has not failed.
 */
export class ContactActivitiesService extends BaseRecordService<ContactActivityOutput> {
  constructor(organizationService: OrganizationService, repository: ContactActivitiesRepository) {
    super(organizationService, {
      label: 'Contact activity',
      repository,
      parseCreate: refuseGenericContactActivity,
      namedCreates: {
        'send-message': validateSendContactMessage,
        'log-call': validateLogContactCall,
        'add-note': validateAddContactNote,
      },
      parseUpdate: refuseContactActivityUpdate,
      parseList: validateListContactActivitiesQuery,
      serialize: serializeContactActivity,
      parent: { field: 'contact_id', table: contacts, label: 'Contact' },
      references: [
        {
          field: 'contact_message_template_id',
          table: contact_message_templates,
          label: 'message template',
        },
        {
          field: 'reply_to_contact_activity_id',
          table: contact_activities,
          label: 'contact activity',
        },
        memberReference('author_membership_id'),
        ...LINK_REFERENCES,
      ],
      transitions: {
        // A failed message goes back in the messaging worker's queue (M8).
        resend: {
          statusColumn: 'delivery_status',
          from: [CONTACT_ACTIVITY_DELIVERY_STATUS.FAILED],
          set: {
            delivery_status: CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED,
            failure_reason: null,
            failed_at: null,
          },
        },
      },
      ...createContactActivitiesRules(repository),
    });
  }
}
