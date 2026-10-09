import http from 'k6/http';
import encoding from 'k6/encoding';
import { Counter } from 'k6/metrics';
import { idempotencyKey } from '../helpers/idempotency.js';
import { API_PREFIX } from '../helpers/config.js';
import { assertCondition, requireData } from '../helpers/checks.js';
import { credentialPool, mintTokenPool } from '../helpers/pool.js';

/** Actual bytes -> presigned upload -> confirm -> avatar/logo attach -> detach -> delete, with foreign-owner denials. */
const VUS = Number(__ENV.VUS || '4');
const ITERATIONS = Number(__ENV.ITERATIONS || '5');
const completed = new Counter('upload_asset_journeys_completed');
const png = encoding.b64decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1sAAAAASUVORK5CYII=',
);
export const options = {
  scenarios: { assets: { executor: 'per-vu-iterations', vus: VUS, iterations: ITERATIONS } },
  setupTimeout: '120s',
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    upload_asset_journeys_completed: [`count==${VUS * ITERATIONS}`],
    http_req_duration: ['p(95)<800', 'p(99)<1200'],
  },
};
export function setup() {
  const owners = Array.from(credentialPool).filter(
    (entry, index, entries) =>
      entries.findIndex((other) => other.organizationPublicId === entry.organizationPublicId) ===
      index,
  );
  if (owners.length < Math.max(VUS, 2))
    throw new Error('One distinct tenant per writer and a foreign owner required');
  return mintTokenPool(owners.slice(0, Math.max(VUS, 2)));
}
function request(method, path, token, body, expected = 200) {
  const response = http.request(
    method,
    `${API_PREFIX}${path}`,
    body ? JSON.stringify(body) : null,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': idempotencyKey('upload-asset'),
      },
      tags: {
        name: `${method} ${path.replace(/upl_[a-z0-9]+/g, ':upload_id')}`,
        route: path.split('?')[0],
      },
      responseCallback: http.expectedStatuses(expected),
    },
  );
  assertCondition(
    response.status === expected,
    `${method} ${path.split('/').slice(0, 4).join('/')}: exact ${expected}`,
  );
  return response;
}
function storeBytes(created) {
  // Fail before sending bytes if fixture configuration minted a URL outside the selected local storage service.
  assertCondition(
    /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(created.upload_url),
    'presigned URL targets explicit loopback storage fixture',
  );
  const upload =
    created.upload_method === 'POST'
      ? http.post(
          created.upload_url,
          { ...created.fields, file: http.file(png, 'load.png', 'image/png') },
          {
            tags: { name: 'fixture-storage-upload', fixture: 'storage' },
            responseCallback: http.expectedStatuses(204),
          },
        )
      : http.put(created.upload_url, png, {
          headers: { 'Content-Type': 'image/png' },
          tags: { name: 'fixture-storage-upload', fixture: 'storage' },
        });
  assertCondition([200, 204].includes(upload.status), 'real image bytes stored');
}
function checkAsset({ owner, foreign, purpose }) {
  const organization = purpose === 'organization-logo';
  const created = requireData(
    request('POST', '/uploads', owner.token, {
      purpose,
      for: organization ? 'organization' : 'user',
      ...(organization ? { organization_id: owner.organizationPublicId } : {}),
      content_type: 'image/png',
      file_name: 'load.png',
      file_size: png.byteLength,
    }),
    'create upload slot',
  );
  let attached = false;
  let removed = false;
  try {
    const pending = requireData(
      request('GET', `/uploads/${created.id}`, owner.token),
      'pending upload',
    );
    assertCondition(pending.id === created.id && pending.status === 'PENDING', 'slot is pending');
    request('GET', `/uploads/${created.id}`, foreign.token, null, 404);
    request('POST', `/uploads/${created.id}/confirm`, foreign.token, null, 404);
    request('DELETE', `/uploads/${created.id}`, foreign.token, null, 404);
    storeBytes(created);
    const confirmed = requireData(
      request('POST', `/uploads/${created.id}/confirm`, owner.token),
      'confirm real object',
    );
    assertCondition(
      confirmed.status === 'UPLOADED' && confirmed.file_size === png.byteLength,
      'confirmed bytes and declared size agree',
    );
    requireData(
      organization
        ? request('PUT', '/tenancy/organization/logo', owner.token, { key: created.key })
        : request('PUT', '/users/me/avatar', owner.token, { avatar_key: created.key }),
      'attach asset',
    );
    attached = true;
    const readback = requireData(
      request('GET', organization ? '/tenancy/organization' : '/users/me', owner.token),
      'asset readback',
    );
    assertCondition(
      Boolean(organization ? readback.logo_url : readback.avatar_url),
      'attached asset is publicly readable',
    );
    if (organization) request('DELETE', '/tenancy/organization/logo', owner.token, null, 204);
    else request('DELETE', '/users/me/avatar', owner.token, null, 204);
    attached = false;
    const cleared = requireData(
      request('GET', organization ? '/tenancy/organization' : '/users/me', owner.token),
      'asset removal readback',
    );
    assertCondition(
      (organization ? cleared.logo_url : cleared.avatar_url) === null,
      'detached asset cleared',
    );
    request('DELETE', `/uploads/${created.id}`, owner.token, null, 204);
    removed = true;
    request('GET', `/uploads/${created.id}`, owner.token, null, 404);
  } finally {
    if (attached)
      request(
        'DELETE',
        organization ? '/tenancy/organization/logo' : '/users/me/avatar',
        owner.token,
        null,
        204,
      );
    if (!removed) request('DELETE', `/uploads/${created.id}`, owner.token, null, 204);
  }
}
export default function (owners) {
  const owner = owners[__VU - 1];
  const foreign = owners[__VU % owners.length];
  checkAsset({ owner, foreign, purpose: 'avatar' });
  checkAsset({ owner, foreign, purpose: 'organization-logo' });
  completed.add(1);
}
