import nock from 'nock';

/** Test-only HTTP interception; application validators, signing and workers remain real. */
if (process.env.TEST_MODE !== 'true' || process.env.LOAD_PROVIDER_MODE !== 'contract')
  throw new Error('Provider preload requires explicit contract-test mode');
const base = process.env.LOAD_PROVIDER_URL;
const token = process.env.LOAD_PROVIDER_TOKEN;
if (base !== 'http://127.0.0.1:3006' || !token || token.length < 32)
  throw new Error('Authorized loopback provider required');
async function forward(path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body, headers }),
  });
  const result = (await response.json()).data;
  return [result.status, result.body, { 'Content-Type': 'application/json' }];
}
for (const method of ['get', 'post', 'delete']) {
  nock('https://api.stripe.com')
    .persist()
    [method](/\/v1\/.*/)
    .query(true)
    .reply(async function (uri, body) {
      return forward(`/stripe/${method}${uri}`, body, this.req.headers);
    });
}
// A public IP fixture avoids external DNS variability; production SSRF validation still runs.
// The destination is intercepted only in this explicitly preloaded test process.
if (process.env.LOAD_PROVIDER_MODE === 'contract') {
  nock.disableNetConnect();
  nock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/);
}
nock('https://1.1.1.1')
  .persist()
  .post(/\/load-webhook\/.*/)
  .reply(async function (uri, body) {
    return forward(`/receiver${uri}`, body, this.req.headers);
  });
