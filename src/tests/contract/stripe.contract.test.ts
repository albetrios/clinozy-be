import Stripe from 'stripe';
import { toClientFacingStripeError } from '@/infrastructure/payment/stripe-error.util.js';
import { describe, expect, test } from 'vitest';

import {
  cancelStripeSubscription,
  createStripeCustomer,
  createStripeSubscription,
  getStripeCustomer,
  listRecentStripeEvents,
  resumeStripeSubscription,
  retrieveStripeSubscriptionSnapshot,
  updateStripeSubscription,
  updateStripeSubscriptionQuantity,
} from '@/infrastructure/payment/stripe.client.js';
import { stripeCircuit } from '@/infrastructure/resilience/circuit-breaker.js';

import customerCreateRequestSubset from './fixtures/stripe/customer.create.request.fields.json' with {
  type: 'json',
};
import customerCreateFixtureResponse from './fixtures/stripe/customer.create.response.json' with {
  type: 'json',
};
import subscriptionCancelFixtureResponse from './fixtures/stripe/subscription.cancel.response.json' with {
  type: 'json',
};
import subscriptionCreateRequestSubset from './fixtures/stripe/subscription.create.request.fields.json' with {
  type: 'json',
};
import subscriptionCreateFixtureResponse from './fixtures/stripe/subscription.create.response.json' with {
  type: 'json',
};
import subscriptionRetrieveFixtureResponse from './fixtures/stripe/subscription.retrieve.response.json' with {
  type: 'json',
};
import subscriptionUpdateCancelFixtureResponse from './fixtures/stripe/subscription.update.cancel-at-period-end.response.json' with {
  type: 'json',
};
import subscriptionUpdateFixtureRequestSubset from './fixtures/stripe/subscription.update.request.fields.json' with {
  type: 'json',
};
import subscriptionUpdateFixtureResponse from './fixtures/stripe/subscription.update.response.json' with {
  type: 'json',
};
import subscriptionResumeFixtureResponse from './fixtures/stripe/subscription.update.resume.response.json' with {
  type: 'json',
};
import { assertStripeEncodedFormContainsExpectedFields } from './helpers/stripe-form.js';
import { registerThirdPartyContractTestIsolationHooks } from './helpers/register-contract-test-hooks.js';
import {
  StripeCustomerApiResponseContractSchema,
  StripeSubscriptionApiResponseContractSchema,
} from './schemas/stripe.schemas.js';

import nock from 'nock';

registerThirdPartyContractTestIsolationHooks();

const stripeOutboundApiHostname = 'https://api.stripe.com';

describe('Stripe outbound SDK contract (`stripe.client`)', () => {
  test('createStripeCustomer encodes predictable fields and maps the Stripe customer response', async () => {
    nock(stripeOutboundApiHostname)
      .post('/v1/customers', (encodedOutboundBodyUnknown) => {
        assertStripeEncodedFormContainsExpectedFields({
          stripeOutboundRequestBody: encodedOutboundBodyUnknown,
          expectedStripeFields: customerCreateRequestSubset as Record<string, string>,
        });
        return true;
      })
      .matchHeader('authorization', /^Bearer /)
      .reply(200, customerCreateFixtureResponse);

    const createdStripeCustomerOutbound = await createStripeCustomer({
      email: customerCreateRequestSubset.email,
      name: customerCreateRequestSubset.name,
      metadata: {
        user_tag: customerCreateRequestSubset['metadata[user_tag]'],
      },
    });

    StripeCustomerApiResponseContractSchema.parse(createdStripeCustomerOutbound);
    expect(createdStripeCustomerOutbound.id).toBe(customerCreateFixtureResponse.id);
    expect(createdStripeCustomerOutbound.email).toBe(customerCreateFixtureResponse.email);
  });

  test('createStripeCustomer forwards the idempotency-key header when provided', async () => {
    const outboundIdempotencyKeyForCustomerCreateFixture = `idem-contract-customer-create-${Date.now().toFixed(0)}`;

    // nock only matches (and replies 200) if the Idempotency-Key header is present with this value;
    // without the fix the header is absent, nock does not match, and the request fails.
    nock(stripeOutboundApiHostname)
      .post('/v1/customers')
      .matchHeader('authorization', /^Bearer /)
      .matchHeader('idempotency-key', outboundIdempotencyKeyForCustomerCreateFixture)
      .reply(200, customerCreateFixtureResponse);

    const createdStripeCustomerOutbound = await createStripeCustomer({
      email: customerCreateRequestSubset.email,
      name: customerCreateRequestSubset.name,
      idempotencyKey: outboundIdempotencyKeyForCustomerCreateFixture,
    });

    StripeCustomerApiResponseContractSchema.parse(createdStripeCustomerOutbound);
    expect(createdStripeCustomerOutbound.id).toBe(customerCreateFixtureResponse.id);
  });

  test('createStripeSubscription sends idempotency header, the seat quantity and maps subscription payload', async () => {
    const outboundIdempotencyKeyForSubscriptionCreateFixture = `idem-contract-subscription-create-${Date.now().toFixed(0)}`;

    nock(stripeOutboundApiHostname)
      .post('/v1/subscriptions', (encodedOutboundBodyUnknown) => {
        assertStripeEncodedFormContainsExpectedFields({
          stripeOutboundRequestBody: encodedOutboundBodyUnknown,
          expectedStripeFields: subscriptionCreateRequestSubset as Record<string, string>,
        });
        return true;
      })
      .matchHeader('authorization', /^Bearer /)
      .matchHeader('idempotency-key', outboundIdempotencyKeyForSubscriptionCreateFixture)
      .reply(200, subscriptionCreateFixtureResponse);

    // The first invoice bills every member the organization already has.
    const createdStripeSubscriptionOutbound = await createStripeSubscription({
      customerId: subscriptionCreateRequestSubset.customer,
      priceId: subscriptionCreateRequestSubset['items[0][price]'],
      quantity: Number(subscriptionCreateRequestSubset['items[0][quantity]']),
      idempotencyKey: outboundIdempotencyKeyForSubscriptionCreateFixture,
    });

    StripeSubscriptionApiResponseContractSchema.parse(createdStripeSubscriptionOutbound);
    expect(createdStripeSubscriptionOutbound.id).toBe(subscriptionCreateFixtureResponse.id);
    expect(createdStripeSubscriptionOutbound.status).toBe(subscriptionCreateFixtureResponse.status);
  });

  test('updateStripeSubscription issues retrieve followed by predictable price swap fields', async () => {
    const subscriptionFixtureIdentifierOutbound = subscriptionRetrieveFixtureResponse.id;
    const subscriptionResourceGetPathPrefixOutbound = `/v1/subscriptions/${subscriptionFixtureIdentifierOutbound}`;

    nock(stripeOutboundApiHostname)
      .get((requestPathOutbound) =>
        requestPathOutbound.startsWith(subscriptionResourceGetPathPrefixOutbound),
      )
      .matchHeader('authorization', /^Bearer /)
      .reply(200, subscriptionRetrieveFixtureResponse);

    nock(stripeOutboundApiHostname)
      .post(
        `/v1/subscriptions/${subscriptionFixtureIdentifierOutbound}`,
        (encodedOutboundBodyUnknown) => {
          assertStripeEncodedFormContainsExpectedFields({
            stripeOutboundRequestBody: encodedOutboundBodyUnknown,
            expectedStripeFields: subscriptionUpdateFixtureRequestSubset as Record<string, string>,
          });
          return true;
        },
      )
      .matchHeader('authorization', /^Bearer /)
      .reply(200, subscriptionUpdateFixtureResponse);

    const patchedStripeSubscriptionOutbound = await updateStripeSubscription(
      subscriptionFixtureIdentifierOutbound,
      {
        priceId: subscriptionUpdateFixtureRequestSubset['items[0][price]'],
        metadata: {
          next_sync: subscriptionUpdateFixtureRequestSubset['metadata[next_sync]'],
        },
      },
    );

    StripeSubscriptionApiResponseContractSchema.parse(patchedStripeSubscriptionOutbound);
    expect(patchedStripeSubscriptionOutbound.id).toBe(subscriptionRetrieveFixtureResponse.id);
  });

  test('updateStripeSubscriptionQuantity retrieves then posts the item id + quantity + proration (REQ-4)', async () => {
    const subscriptionFixtureIdentifierOutbound = subscriptionRetrieveFixtureResponse.id;
    const subscriptionResourceGetPathPrefixOutbound = `/v1/subscriptions/${subscriptionFixtureIdentifierOutbound}`;
    const outboundIdempotencyKeyForQuantitySync = `idem-contract-seat-sync-${Date.now().toFixed(0)}`;

    nock(stripeOutboundApiHostname)
      .get((requestPathOutbound) =>
        requestPathOutbound.startsWith(subscriptionResourceGetPathPrefixOutbound),
      )
      .matchHeader('authorization', /^Bearer /)
      .reply(200, subscriptionRetrieveFixtureResponse);

    nock(stripeOutboundApiHostname)
      .post(
        `/v1/subscriptions/${subscriptionFixtureIdentifierOutbound}`,
        (encodedOutboundBodyUnknown) => {
          assertStripeEncodedFormContainsExpectedFields({
            stripeOutboundRequestBody: encodedOutboundBodyUnknown,
            expectedStripeFields: {
              // The quantity is applied to the EXISTING line item (no second item), prorated.
              'items[0][id]': subscriptionRetrieveFixtureResponse.items.data[0]!.id,
              'items[0][quantity]': '7',
              proration_behavior: 'create_prorations',
            },
          });
          return true;
        },
      )
      .matchHeader('authorization', /^Bearer /)
      .matchHeader('idempotency-key', outboundIdempotencyKeyForQuantitySync)
      .reply(200, subscriptionUpdateFixtureResponse);

    const patchedStripeSubscriptionOutbound = await updateStripeSubscriptionQuantity(
      subscriptionFixtureIdentifierOutbound,
      7,
      { idempotencyKey: outboundIdempotencyKeyForQuantitySync },
    );

    StripeSubscriptionApiResponseContractSchema.parse(patchedStripeSubscriptionOutbound);
    expect(patchedStripeSubscriptionOutbound.id).toBe(subscriptionRetrieveFixtureResponse.id);
  });

  test('cancelStripeSubscription with cancel-at-period-end issues POST cancellation flags', async () => {
    const subscriptionFixtureIdentifierOutbound = subscriptionUpdateCancelFixtureResponse.id;

    nock(stripeOutboundApiHostname)
      .post(
        `/v1/subscriptions/${subscriptionFixtureIdentifierOutbound}`,
        (encodedOutboundBodyUnknown) => {
          assertStripeEncodedFormContainsExpectedFields({
            stripeOutboundRequestBody: encodedOutboundBodyUnknown,
            expectedStripeFields: { cancel_at_period_end: 'true' },
          });
          return true;
        },
      )
      .matchHeader('authorization', /^Bearer /)
      .reply(200, subscriptionUpdateCancelFixtureResponse);

    const canceledStripeSubscriptionOutbound = await cancelStripeSubscription(
      subscriptionFixtureIdentifierOutbound,
      true,
    );

    StripeSubscriptionApiResponseContractSchema.parse(canceledStripeSubscriptionOutbound);
    expect(canceledStripeSubscriptionOutbound.cancel_at_period_end).toBe(true);
  });

  test('resumeStripeSubscription issues cancel-at-period-end false form body', async () => {
    const subscriptionFixtureIdentifierOutbound = subscriptionResumeFixtureResponse.id;

    nock(stripeOutboundApiHostname)
      .post(
        `/v1/subscriptions/${subscriptionFixtureIdentifierOutbound}`,
        (encodedOutboundBodyUnknown) => {
          assertStripeEncodedFormContainsExpectedFields({
            stripeOutboundRequestBody: encodedOutboundBodyUnknown,
            expectedStripeFields: { cancel_at_period_end: 'false' },
          });
          return true;
        },
      )
      .matchHeader('authorization', /^Bearer /)
      .reply(200, subscriptionResumeFixtureResponse);

    const resumedStripeSubscriptionOutbound = await resumeStripeSubscription(
      subscriptionFixtureIdentifierOutbound,
    );

    StripeSubscriptionApiResponseContractSchema.parse(resumedStripeSubscriptionOutbound);
    expect(resumedStripeSubscriptionOutbound.cancel_at_period_end).toBe(false);
  });

  test('cancelStripeSubscription with immediate termination issues DELETE verb', async () => {
    const subscriptionFixtureIdentifierOutbound = subscriptionCancelFixtureResponse.id;

    nock(stripeOutboundApiHostname)
      .delete(`/v1/subscriptions/${subscriptionFixtureIdentifierOutbound}`)
      .matchHeader('authorization', /^Bearer /)
      .reply(200, subscriptionCancelFixtureResponse);

    const immediateCanceledStripeSubscriptionOutbound = await cancelStripeSubscription(
      subscriptionFixtureIdentifierOutbound,
      false,
    );

    StripeSubscriptionApiResponseContractSchema.parse(immediateCanceledStripeSubscriptionOutbound);
    expect(immediateCanceledStripeSubscriptionOutbound.status).toBe('canceled');
  });

  test('listRecentStripeEvents sends created[gte]+limit and maps the events.list page data', async () => {
    const createdGteSeconds = 1_700_000_000;
    let capturedQuery: Record<string, string> | undefined;

    nock(stripeOutboundApiHostname)
      .get('/v1/events')
      .query((actualQuery) => {
        capturedQuery = actualQuery as Record<string, string>;
        return true;
      })
      .matchHeader('authorization', /^Bearer /)
      .reply(200, {
        object: 'list',
        has_more: false,
        data: [
          { id: 'evt_catchup_1', object: 'event', type: 'customer.subscription.updated' },
          { id: 'evt_catchup_2', object: 'event', type: 'customer.subscription.deleted' },
        ],
      });

    const events = await listRecentStripeEvents({ createdGteSeconds, limit: 100 });

    expect(events.map((event) => event.id)).toEqual(['evt_catchup_1', 'evt_catchup_2']);
    // The SDK serializes range filters as created[gte] and forwards the page limit.
    expect(capturedQuery?.['created[gte]']).toBe(String(createdGteSeconds));
    expect(capturedQuery?.limit).toBe('100');
  });

  test('a run of not-found customer lookups never opens the stripe circuit', async () => {
    // One more lookup than the circuit's failure threshold (5): counted as failures, they would
    // open it — the last lookup would throw CircuitBreakerOpenError instead of returning null, and
    // every other billing call would be refused for 30 seconds.
    const lookupCount = 6;
    nock(stripeOutboundApiHostname)
      .get('/v1/customers/cus_missing')
      .times(lookupCount)
      .reply(404, {
        error: {
          type: 'invalid_request_error',
          code: 'resource_missing',
          message: "No such customer: 'cus_missing'",
          param: 'id',
        },
      });

    for (let lookup = 0; lookup < lookupCount; lookup += 1) {
      await expect(getStripeCustomer('cus_missing')).resolves.toBeNull();
    }
    expect(await stripeCircuit.getState()).toBe('CLOSED');
  });
  test('snapshot retrieval exposes provider 5xx after one bounded SDK attempt', async () => {
    let calls = 0;
    nock(stripeOutboundApiHostname)
      .get('/v1/subscriptions/sub_snapshot_failure')
      .reply(() => {
        calls += 1;
        return [
          503,
          { error: { type: 'api_error', message: 'Temporary provider outage' } },
          { 'stripe-should-retry': 'true' },
        ];
      });
    const error = await retrieveStripeSubscriptionSnapshot('sub_snapshot_failure').catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(Stripe.errors.StripeAPIError);
    expect(toClientFacingStripeError(error)?.statusCode).toBe(503);
    expect(calls).toBe(1);
  });

  test('snapshot connection reset remains visible without an unbounded SDK retry', async () => {
    nock(stripeOutboundApiHostname)
      .get('/v1/subscriptions/sub_snapshot_reset')
      .replyWithError(Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }));
    const error = await retrieveStripeSubscriptionSnapshot('sub_snapshot_reset').catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(Stripe.errors.StripeConnectionError);
    expect(toClientFacingStripeError(error)?.statusCode).toBe(503);
  });

  test('rate limiting preserves the provider error instead of returning a customer', async () => {
    nock(stripeOutboundApiHostname)
      .post('/v1/customers')
      .reply(
        429,
        { error: { type: 'rate_limit_error', message: 'Account rate limited' } },
        { 'retry-after': '2', 'stripe-should-retry': 'false' },
      );
    const error = await createStripeCustomer({
      email: 'rate-limit@example.com',
      name: 'Rate limit',
      idempotencyKey: 'contract-rate-limit',
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Stripe.errors.StripeRateLimitError);
    expect(toClientFacingStripeError(error)?.statusCode).toBe(503);
  });

  test('a retried create reuses the same key after the provider accepted the first request', async () => {
    const key = 'contract-accepted-response-lost';
    const accepted = new Map<string, typeof customerCreateFixtureResponse>();
    let calls = 0;
    nock(stripeOutboundApiHostname)
      .post('/v1/customers')
      .matchHeader('idempotency-key', key)
      .twice()
      .reply(() => {
        calls += 1;
        if (!accepted.has(key)) accepted.set(key, customerCreateFixtureResponse);
        return calls === 1
          ? [
              503,
              { error: { type: 'api_error', message: 'Response lost after acceptance' } },
              { 'stripe-should-retry': 'true' },
            ]
          : [200, accepted.get(key)!];
      });
    const customer = await createStripeCustomer({
      email: 'retry@example.com',
      name: 'Retry',
      idempotencyKey: key,
    });
    expect(customer.id).toBe(customerCreateFixtureResponse.id);
    expect(calls).toBe(2);
    expect(accepted.size).toBe(1);
  });

  test('a declined subscription is a caller-visible payment refusal and does not open the circuit', async () => {
    nock(stripeOutboundApiHostname)
      .post('/v1/subscriptions')
      .reply(402, {
        error: {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'generic_decline',
          message: 'Card declined',
        },
      });
    const error = await createStripeSubscription({
      customerId: subscriptionCreateRequestSubset.customer,
      priceId: subscriptionCreateRequestSubset['items[0][price]'],
      idempotencyKey: 'contract-declined-subscription',
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Stripe.errors.StripeCardError);
    expect(toClientFacingStripeError(error)?.statusCode).toBe(422);
    expect(await stripeCircuit.getState()).toBe('CLOSED');
  });
});
