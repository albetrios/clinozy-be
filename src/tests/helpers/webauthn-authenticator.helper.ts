import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from 'node:crypto';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

/** Authenticator-data flags: user present (bit 0) and user verified (bit 2). */
const USER_PRESENT_AND_VERIFIED_FLAGS = 0x01 | 0x04;
/** Authenticator-data flag: attested credential data included (bit 6), set on registration only. */
const ATTESTED_CREDENTIAL_DATA_FLAG = 0x40;
/** CBOR major types used by the attestation object and the COSE public key. */
const CBOR_MAJOR_TYPE = {
  unsignedInteger: 0,
  negativeInteger: 1,
  byteString: 2,
  textString: 3,
  map: 5,
} as const;

type CborValue = number | string | Buffer | Map<CborValue, CborValue>;

/** Encodes a CBOR item head (major type + argument), covering the lengths this fixture produces. */
function encodeCborHead(majorType: number, argument: number): Buffer {
  if (argument < 24) return Buffer.from([(majorType << 5) | argument]);
  if (argument < 0x100) return Buffer.from([(majorType << 5) | 24, argument]);
  if (argument < 0x10000) {
    const head = Buffer.alloc(3);
    head.writeUInt8((majorType << 5) | 25, 0);
    head.writeUInt16BE(argument, 1);
    return head;
  }
  throw new Error('CBOR argument too large for the software authenticator');
}

/** Minimal CBOR encoder for the fixed shapes WebAuthn needs (integers, strings, bytes, maps). */
function encodeCbor(value: CborValue): Buffer {
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([encodeCborHead(CBOR_MAJOR_TYPE.byteString, value.length), value]);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([encodeCborHead(CBOR_MAJOR_TYPE.textString, bytes.length), bytes]);
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('CBOR encoder supports integers only');
    return value >= 0
      ? encodeCborHead(CBOR_MAJOR_TYPE.unsignedInteger, value)
      : encodeCborHead(CBOR_MAJOR_TYPE.negativeInteger, -1 - value);
  }
  return Buffer.concat([
    encodeCborHead(CBOR_MAJOR_TYPE.map, value.size),
    ...Array.from(value).flatMap(([key, item]) => [encodeCbor(key), encodeCbor(item)]),
  ]);
}

/** SHA-256 digest of a string or byte sequence. */
function sha256Digest(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

/** Serializes `CollectedClientData` exactly as a browser would hand it to the relying party. */
function buildClientDataJson(options: {
  type: 'webauthn.create' | 'webauthn.get';
  challenge: string;
  origin: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      type: options.type,
      challenge: options.challenge,
      origin: options.origin,
      crossOrigin: false,
    }),
  );
}

/**
 * One passkey held by the software authenticator: a P-256 key pair, its random credential id and
 * the signature counter the authenticator bumps on every assertion.
 */
export type SoftwareWebauthnCredential = {
  readonly credentialId: string;
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  signatureCounter: number;
};

/**
 * Mints a fresh passkey for the software authenticator: a node:crypto P-256 (ES256) key pair and
 * a random 32-byte credential id (base64url).
 */
export function createSoftwareWebauthnCredential(): SoftwareWebauthnCredential {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    credentialId: randomBytes(32).toString('base64url'),
    privateKey,
    publicKey,
    signatureCounter: 0,
  };
}

/** COSE_Key (EC2, ES256, P-256) for the credential's public key, CBOR-encoded. */
function encodeCosePublicKey(publicKey: KeyObject): Buffer {
  const jsonWebKey = publicKey.export({ format: 'jwk' });
  if (!(jsonWebKey.x && jsonWebKey.y)) throw new Error('P-256 public key is missing coordinates');
  return encodeCbor(
    new Map<CborValue, CborValue>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jsonWebKey.x, 'base64url')],
      [-3, Buffer.from(jsonWebKey.y, 'base64url')],
    ]),
  );
}

/**
 * Produces a genuine `navigator.credentials.create()` result for `credential`: a `none`-format
 * attestation object whose authenticator data binds the SHA-256 of the options' relying-party id,
 * flags user presence + verification + attested credential data, and embeds the COSE public key,
 * plus a `webauthn.create` client data carrying the options' challenge and `origin`.
 *
 * @remarks Reusing one credential across two calls re-attests the same passkey, as an
 * authenticator ignoring `excludeCredentials` would — the server must reject the duplicate.
 */
export function createSoftwareRegistrationResponse(options: {
  credential: SoftwareWebauthnCredential;
  creationOptions: PublicKeyCredentialCreationOptionsJSON;
  origin: string;
}): RegistrationResponseJSON {
  const { credential, creationOptions, origin } = options;
  const relyingPartyId = creationOptions.rp.id;
  if (!relyingPartyId) throw new Error('Registration options carry no relying-party id');
  const credentialIdBytes = Buffer.from(credential.credentialId, 'base64url');
  const credentialIdLength = Buffer.alloc(2);
  credentialIdLength.writeUInt16BE(credentialIdBytes.length);
  const authenticatorData = Buffer.concat([
    sha256Digest(relyingPartyId),
    Buffer.from([USER_PRESENT_AND_VERIFIED_FLAGS | ATTESTED_CREDENTIAL_DATA_FLAG]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    credentialIdLength,
    credentialIdBytes,
    encodeCosePublicKey(credential.publicKey),
  ]);
  const attestationObject = encodeCbor(
    new Map<CborValue, CborValue>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authenticatorData],
    ]),
  );
  return {
    id: credential.credentialId,
    rawId: credential.credentialId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: buildClientDataJson({
        type: 'webauthn.create',
        challenge: creationOptions.challenge,
        origin,
      }).toString('base64url'),
      attestationObject: attestationObject.toString('base64url'),
      transports: ['internal'],
    },
  };
}

/**
 * Produces a genuine `navigator.credentials.get()` assertion for `credential`: increments its
 * signature counter, builds authenticator data over the options' relying-party id with user
 * presence + verification, and ECDSA-signs `authenticatorData || SHA-256(clientDataJSON)` with
 * the credential's private key. `userHandle` is the base64url `user.id` from registration.
 */
export function createSoftwareAuthenticationResponse(options: {
  credential: SoftwareWebauthnCredential;
  requestOptions: PublicKeyCredentialRequestOptionsJSON;
  origin: string;
  userHandle: string;
}): AuthenticationResponseJSON {
  const { credential, requestOptions, origin, userHandle } = options;
  const relyingPartyId = requestOptions.rpId;
  if (!relyingPartyId) throw new Error('Authentication options carry no relying-party id');
  credential.signatureCounter += 1;
  const signatureCounter = Buffer.alloc(4);
  signatureCounter.writeUInt32BE(credential.signatureCounter);
  const authenticatorData = Buffer.concat([
    sha256Digest(relyingPartyId),
    Buffer.from([USER_PRESENT_AND_VERIFIED_FLAGS]),
    signatureCounter,
  ]);
  const clientDataJson = buildClientDataJson({
    type: 'webauthn.get',
    challenge: requestOptions.challenge,
    origin,
  });
  const signature = sign(
    'sha256',
    Buffer.concat([authenticatorData, sha256Digest(clientDataJson)]),
    credential.privateKey,
  );
  return {
    id: credential.credentialId,
    rawId: credential.credentialId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: clientDataJson.toString('base64url'),
      authenticatorData: authenticatorData.toString('base64url'),
      signature: signature.toString('base64url'),
      userHandle,
    },
  };
}
