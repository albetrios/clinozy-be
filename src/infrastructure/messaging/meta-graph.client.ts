import { env } from '@/shared/config/env.config.js';
import { buildOutboundFetchOptions, outboundFetchJson } from '@/infrastructure/outbound/index.js';
import { MetaGraphApiError } from '@/infrastructure/messaging/meta-graph-error.util.js';
import { metaCircuit } from '@/infrastructure/resilience/circuit-breaker.js';

/** One sent message — Meta's id for it, which its delivery reports carry. */
export interface MetaSentMessage {
  providerMessageId: string;
}

/** A Graph API `POST …/messages` answer: WhatsApp's `messages[].id`, or Instagram's `message_id`. */
interface GraphSendAnswer {
  messages?: { id?: unknown }[];
  message_id?: unknown;
}

/** The Graph API request every call makes — the platform token, JSON, the `meta` integration. */
async function callGraph<T>(options: {
  path: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
}): Promise<T> {
  const token = env.META_GRAPH_ACCESS_TOKEN;
  if (!token) throw new Error('meta_graph_access_token_missing');
  return outboundFetchJson<T>(
    buildOutboundFetchOptions({
      name: 'meta',
      url: `${env.META_GRAPH_API_BASE_URL}/${options.path}`,
      init: {
        method: options.method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(options.body ? { 'content-type': 'application/json' } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      },
      expectedStatus: 200,
      classifyResponseError: (response, body) =>
        new MetaGraphApiError({
          statusCode: response.status,
          body,
          retryAfterSeconds: response.headers.get('retry-after'),
        }),
    }),
  );
}

/** Meta's id in a send answer — a send that came back without one is a Graph failure. */
function sentMessageOf(answer: GraphSendAnswer): MetaSentMessage {
  const id = answer.messages?.[0]?.id ?? answer.message_id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new MetaGraphApiError({
      statusCode: 502,
      body: JSON.stringify({ error: { message: 'The Graph API returned no message id' } }),
      retryAfterSeconds: null,
    });
  }
  return { providerMessageId: id };
}

/**
 * Sends a WhatsApp text from the clinic's WhatsApp Business number (launch D77).
 *
 * @remarks
 * - **Algorithm:** `POST /{phone-number-id}/messages` with `messaging_product: whatsapp`, the
 *   recipient's number without its `+`, and the text; returns Meta's `wamid`.
 * - **Failure modes:** {@link MetaGraphApiError} for a Graph error answer (inside an
 *   `ExternalServiceError` from `outboundCall`), `ExternalServiceError` for a timeout, a network
 *   failure or the `meta` circuit open.
 * - **Side effects:** one HTTPS request to the Graph API — never inside a database context.
 */
export async function sendWhatsAppTextMessage(options: {
  phoneNumberId: string;
  to: string;
  body: string;
}): Promise<MetaSentMessage> {
  const answer = await callGraph<GraphSendAnswer>({
    path: `${encodeURIComponent(options.phoneNumberId)}/messages`,
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: options.to.replace(/^\+/, ''),
      type: 'text',
      text: { body: options.body, preview_url: false },
    },
  });
  return sentMessageOf(answer);
}

/**
 * Sends an Instagram direct message from the clinic's Instagram account (launch D77).
 *
 * @remarks
 * - **Algorithm:** `POST /{instagram-account-id}/messages` to the person's Instagram-scoped id
 *   (known once they have messaged the clinic); returns Meta's message id.
 * - **Failure modes:** as {@link sendWhatsAppTextMessage}.
 * - **Side effects:** one HTTPS request to the Graph API.
 */
export async function sendInstagramTextMessage(options: {
  accountId: string;
  recipientId: string;
  body: string;
}): Promise<MetaSentMessage> {
  const answer = await callGraph<GraphSendAnswer>({
    path: `${encodeURIComponent(options.accountId)}/messages`,
    method: 'POST',
    body: { recipient: { id: options.recipientId }, message: { text: options.body } },
  });
  return sentMessageOf(answer);
}

/** A file a message carries — a link Meta fetches it from when it sends (launch D78, WC-11). */
export interface MetaMediaAttachment {
  /** `image` (JPEG or PNG) or `document` (anything else — a PDF, a WebP). */
  kind: 'image' | 'document';
  /** A short-lived HTTPS link to the file (a presigned download URL). */
  url: string;
  fileName: string;
}

/**
 * Sends one file as a WhatsApp media message — an image, or a document with its file name — with
 * an optional caption (launch D78, WC-11: the visit's Rx, invoice and photos).
 *
 * @remarks
 * - **Algorithm:** `POST /{phone-number-id}/messages` with `type` `image` or `document` and its
 *   `link`; Meta downloads the file from the link; returns Meta's `wamid`.
 * - **Failure modes:** as {@link sendWhatsAppTextMessage}; Meta refuses a link it cannot fetch
 *   (a 4xx — a rejection).
 * - **Side effects:** one HTTPS request to the Graph API.
 */
export async function sendWhatsAppMediaMessage(options: {
  phoneNumberId: string;
  to: string;
  attachment: MetaMediaAttachment;
  caption?: string;
}): Promise<MetaSentMessage> {
  const { attachment } = options;
  const media: Record<string, unknown> = {
    link: attachment.url,
    ...(options.caption ? { caption: options.caption } : {}),
    ...(attachment.kind === 'document' ? { filename: attachment.fileName } : {}),
  };
  const answer = await callGraph<GraphSendAnswer>({
    path: `${encodeURIComponent(options.phoneNumberId)}/messages`,
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: options.to.replace(/^\+/, ''),
      type: attachment.kind,
      [attachment.kind]: media,
    },
  });
  return sentMessageOf(answer);
}

/**
 * Sends one file as an Instagram attachment — an image or a file (launch D78, WC-11).
 *
 * @remarks
 * - **Algorithm:** `POST /{instagram-account-id}/messages` with `attachment.type` `image` or
 *   `file` and its `payload.url`; returns Meta's message id.
 * - **Failure modes:** as {@link sendWhatsAppTextMessage}.
 * - **Side effects:** one HTTPS request to the Graph API.
 */
export async function sendInstagramAttachmentMessage(options: {
  accountId: string;
  recipientId: string;
  attachment: MetaMediaAttachment;
}): Promise<MetaSentMessage> {
  const answer = await callGraph<GraphSendAnswer>({
    path: `${encodeURIComponent(options.accountId)}/messages`,
    method: 'POST',
    body: {
      recipient: { id: options.recipientId },
      message: {
        attachment: {
          type: options.attachment.kind === 'image' ? 'image' : 'file',
          payload: { url: options.attachment.url },
        },
      },
    },
  });
  return sentMessageOf(answer);
}

/**
 * The Instagram username behind an Instagram-scoped id — how an unknown sender is matched to a
 * contact's Instagram handles (launch D77).
 *
 * @remarks
 * - **Algorithm:** `GET /{instagram-scoped-id}?fields=username`; lower-cased, without `@`.
 * - **Failure modes:** as {@link sendWhatsAppTextMessage}; `null` when Meta returns no username.
 * - **Side effects:** one HTTPS request to the Graph API.
 */
export async function fetchInstagramUsername(instagramScopedId: string): Promise<string | null> {
  const answer = await callGraph<{ username?: unknown }>({
    path: `${encodeURIComponent(instagramScopedId)}?fields=username`,
    method: 'GET',
  });
  return typeof answer.username === 'string' && answer.username.length > 0
    ? answer.username.replace(/^@/, '').toLowerCase()
    : null;
}

/**
 * Whether Meta is failing right now — the `meta` circuit is open or probing. What the composer's
 * "WhatsApp down · replies will queue" reads (launch D77, WC-2).
 *
 * @remarks
 * - **Algorithm:** the circuit's state (Redis, falling back to the in-memory copy) is not `CLOSED`.
 * - **Failure modes:** none — the circuit read never throws.
 */
export async function isMetaProviderDown(): Promise<boolean> {
  return (await metaCircuit.getState()) !== 'CLOSED';
}
