/** Queued messages one delivery job sends — the rest go in the next job (launch D77). */
export const CONTACT_MESSAGE_DELIVERY_BATCH = 20;

/** A delivery claim older than this belongs to a job that died — the message is claimable again. */
export const CONTACT_MESSAGE_DELIVERY_CLAIM_STALE_MINUTES = 5;

/** Organizations one read of the messaging sweep pages through — it reads until none are left. */
export const CONTACT_MESSAGE_DELIVERY_SWEEP_BATCH = 500;

/** Why a WhatsApp message failed before Meta saw it — the clinic has no WhatsApp number connected. */
export const CONTACT_MESSAGE_FAILURE_WHATSAPP_NOT_CONNECTED =
  "The clinic's WhatsApp number is not connected";
/** Why a WhatsApp message failed before Meta saw it — the person's number is not on WhatsApp. */
export const CONTACT_MESSAGE_FAILURE_NOT_ON_WHATSAPP = "This person's number is not on WhatsApp";
/** Why an Instagram message failed before Meta saw it — the clinic has no Instagram account connected. */
export const CONTACT_MESSAGE_FAILURE_INSTAGRAM_NOT_CONNECTED =
  "The clinic's Instagram account is not connected";
/** Why an Instagram message failed before Meta saw it — the person never messaged the clinic there. */
export const CONTACT_MESSAGE_FAILURE_NO_INSTAGRAM_CONVERSATION =
  'No Instagram conversation with this person yet — they need to message the clinic first';
/** Why a message with files failed before Meta saw it — one of its uploads is gone (D78, WC-11). */
export const CONTACT_MESSAGE_FAILURE_ATTACHMENT_MISSING =
  'One of the attached files is no longer available — attach it again';

/** The attached files WhatsApp shows as an image — the rest go as documents. */
export const CONTACT_MESSAGE_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
]);
