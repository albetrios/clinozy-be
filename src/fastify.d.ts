import 'fastify';
import type { TFunction } from 'i18next';
import type { AuditContainer } from '@/domains/audit/audit.container.js';
import type { AuthContainer } from '@/domains/auth/auth.container.js';
import type { BillingContainer } from '@/domains/billing/billing.container.js';
import type { NotifyContainer } from '@/domains/notify/notify.container.js';
import type { AppContainer } from '@/domains/app/app.container.js';
import type { TenancyContainer } from '@/domains/tenancy/tenancy.container.js';
import type { UploadContainer } from '@/domains/upload/upload.container.js';
import type { UserContainer } from '@/domains/user/user.container.js';
import type { AuthContext } from '@/shared/types/index.js';
import type { PrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import type { FastifyReply } from 'fastify';
import type Stripe from 'stripe';

declare module 'fastify' {
  interface FastifyContextConfig {
    idempotencyRequired?: boolean;
    /**
     * sec-B finding #7: routes set this flag to request that the global
     * content-type parser capture the raw body buffer onto `request.rawBody`
     * for HMAC signature verification. The Stripe webhook routes plugin reads
     * this flag in its `onRoute` hook and populates the raw-body URL registry
     * read by the parser at request time.
     */
    captureRawBody?: boolean;
  }

  interface FastifyRequest {
    auth: AuthContext | null;
    /**
     * The request-minted principal scope — eagerly assigned by the auth
     * middleware after authentication (JWT or API key), carrying whatever
     * verified ids the token holds. Undefined at runtime only on
     * public/unauthenticated routes, which must not read it.
     */
    principalScope: PrincipalDatabaseScope;
    organizationId: string | null;
    rawBody: Buffer | undefined;
    /** Set by stripe webhook ingress plugin after signature verification. */
    stripeWebhookEvent?: Stripe.Event;
    metricsStartTimeNanoseconds?: bigint;
    /** i18n translate function fixed to `language` (set by the i18n middleware on every request). */
    t?: TFunction;
    /** The request's supported language code (`SUPPORTED_LANGUAGES`: "en", "es"). */
    language?: string;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Wired by domain `register*Container` functions via `domainContainersPlugin`. */
    userDomain: UserContainer;
    tenancyDomain: TenancyContainer;
    auditDomain: AuditContainer;
    authDomain: AuthContainer;
    billingDomain: BillingContainer;
    notifyDomain: NotifyContainer;
    uploadDomain: UploadContainer;
    appDomain: AppContainer;
  }
}
