import { createServer } from 'node:http';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

/** Loopback virtual authenticator: emits genuine P-256 WebAuthn data; never mocks API verification. */
const authorization = process.env.LOAD_AUTHENTICATOR_TOKEN;
if (process.env.TEST_MODE !== 'true' || !authorization || authorization.length < 32)
  throw new Error('Explicit TEST_MODE and authenticator authorization required');
const credentials = new Map();
function encode(value) {
  const head = (major, length) =>
    length < 24 ? Buffer.from([(major << 5) | length]) : Buffer.from([(major << 5) | 24, length]);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') {
    const bytes = Buffer.from(value);
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (Number.isInteger(value)) return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (value instanceof Map)
    return Buffer.concat([
      head(5, value.size),
      ...Array.from(value).flatMap(([key, item]) => [encode(key), encode(item)]),
    ]);
  throw new Error('Unsupported CBOR value');
}
function clientData({ type, challenge, origin }) {
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
}
function register({ options, origin }) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = randomBytes(32);
  const cose = encode(
    new Map([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, 'base64url')],
      [-3, Buffer.from(jwk.y, 'base64url')],
    ]),
  );
  const length = Buffer.alloc(2);
  length.writeUInt16BE(id.length);
  const data = Buffer.concat([
    createHash('sha256').update(options.rp.id).digest(),
    Buffer.from([69]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    length,
    id,
    cose,
  ]);
  const identifier = id.toString('base64url');
  credentials.set(identifier, {
    privateKey,
    rpId: options.rp.id,
    userHandle: options.user.id,
    counter: 0,
  });
  return {
    id: identifier,
    rawId: identifier,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: clientData({
        type: 'webauthn.create',
        challenge: options.challenge,
        origin,
      }).toString('base64url'),
      attestationObject: encode(
        new Map([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', data],
        ]),
      ).toString('base64url'),
      transports: ['internal'],
    },
  };
}
function authenticate({ options, credentialId, origin }) {
  const credential = credentials.get(credentialId);
  if (!credential) throw new Error('Unknown virtual credential');
  const client = clientData({ type: 'webauthn.get', challenge: options.challenge, origin });
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(++credential.counter);
  const data = Buffer.concat([
    createHash('sha256').update(credential.rpId).digest(),
    Buffer.from([5]),
    counter,
  ]);
  const signature = sign(
    'sha256',
    Buffer.concat([data, createHash('sha256').update(client).digest()]),
    credential.privateKey,
  );
  return {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: client.toString('base64url'),
      authenticatorData: data.toString('base64url'),
      signature: signature.toString('base64url'),
      userHandle: credential.userHandle,
    },
  };
}
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  if (request.headers.authorization !== `Bearer ${authorization}`) {
    response.writeHead(403).end('{}');
    return;
  }
  try {
    let bytes = '';
    for await (const chunk of request) {
      bytes += chunk;
      if (bytes.length > 65536) throw new Error('Payload too large');
    }
    const body = JSON.parse(bytes);
    if (
      request.method !== 'POST' ||
      !['http://localhost:5173', 'http://127.0.0.1:5173'].includes(body.origin)
    )
      throw new Error('Invalid fixture origin');
    if (request.url === '/register') response.end(JSON.stringify({ data: register(body) }));
    else if (request.url === '/authenticate')
      response.end(JSON.stringify({ data: authenticate(body) }));
    else if (request.url === '/delete') {
      credentials.delete(body.credentialId);
      response.end(JSON.stringify({ data: { deleted: true } }));
    } else response.writeHead(404).end('{}');
  } catch {
    response.writeHead(400).end('{}');
  }
});
server.listen(Number(process.env.LOAD_AUTHENTICATOR_PORT || '3005'), '127.0.0.1');
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
