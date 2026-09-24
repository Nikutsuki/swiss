import { base64UrlToBytes, bytesToBase64Url } from "./b64url";

const WRAPPED_DEK_VERSION = 1;
const HKDF_INFO = new TextEncoder().encode("swiss-dek-wrap-v1");
const HKDF_SALT = new Uint8Array();
const ECDH_BITS = 384;

const ecdhP384 = { name: "ECDH" as const, namedCurve: "P-384" as const };

function u16be(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = (n >> 8) & 0xff;
  b[1] = n & 0xff;
  return b;
}

function concatParts(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function deriveAesKwKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    ECDH_BITS,
  );
  const hkdfBase = await crypto.subtle.importKey(
    "raw",
    bits,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT as BufferSource,
      info: HKDF_INFO as BufferSource,
    },
    hkdfBase,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ecdhP384, true, ["deriveBits"]);
}

export async function exportSpkiPublic(publicKey: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey("spki", publicKey);
  return new Uint8Array(buf);
}

export async function importEcdhPublicSpki(spki: Uint8Array): Promise<CryptoKey> {
  const copy = new Uint8Array(spki.byteLength);
  copy.set(spki);
  return crypto.subtle.importKey("spki", copy, ecdhP384, false, []);
}

export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptUtf8(plaintext: string, dek: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dek,
    data as BufferSource,
  );
  return concatParts(iv, new Uint8Array(ct));
}

export async function decryptUtf8(blob: Uint8Array, dek: CryptoKey): Promise<string> {
  const iv = blob.subarray(0, 12);
  const ct = blob.subarray(12);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dek,
    ct as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

/** Wrap DEK for one recipient (their static ECDH public SPKI). */
export async function wrapDekForRecipient(
  dek: CryptoKey,
  recipientSpki: Uint8Array,
): Promise<Uint8Array> {
  const recipientPub = await importEcdhPublicSpki(recipientSpki);
  const pair = (await crypto.subtle.generateKey(ecdhP384, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const aesKw = await deriveAesKwKey(pair.privateKey, recipientPub);
  const wrapped = new Uint8Array(
    await crypto.subtle.wrapKey("raw", dek, aesKw, { name: "AES-KW", length: 256 }),
  );
  const epSpki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const spkiU8 = new Uint8Array(epSpki);
  const header = concatParts(
    new Uint8Array([WRAPPED_DEK_VERSION]),
    u16be(spkiU8.length),
    spkiU8,
  );
  return concatParts(header, wrapped);
}

export async function unwrapDek(
  blob: Uint8Array,
  devicePrivateKey: CryptoKey,
): Promise<CryptoKey> {
  if (blob.length < 4 || blob[0] !== WRAPPED_DEK_VERSION) {
    throw new Error("unsupported wrapped_dek version");
  }
  const spkiLen = (blob[1] << 8) | blob[2];
  const epSpki = blob.subarray(3, 3 + spkiLen);
  const wrappedRaw = blob.subarray(3 + spkiLen);
  if (epSpki.length !== spkiLen) {
    throw new Error("truncated wrapped_dek");
  }
  const ephemeralPub = await importEcdhPublicSpki(epSpki);
  const aesKw = await deriveAesKwKey(devicePrivateKey, ephemeralPub);
  const wrappedBuf = new Uint8Array(wrappedRaw);
  return crypto.subtle.unwrapKey(
    "raw",
    wrappedBuf,
    aesKw,
    { name: "AES-KW", length: 256 },
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );
}

export type DeviceKeyRow = { device_key_id: string; public_key: string };

/** Re-wrap the same DEK for every registered device (e.g. after adding a device). */
export async function rewrapDekForAllDevices(
  dek: CryptoKey,
  deviceKeys: DeviceKeyRow[],
): Promise<{ device_key_id: string; wrapped_dek: string }[]> {
  const wrapped_deks: { device_key_id: string; wrapped_dek: string }[] = [];
  for (const row of deviceKeys) {
    const spki = base64UrlToBytes(row.public_key);
    const wrapped = await wrapDekForRecipient(dek, spki);
    wrapped_deks.push({
      device_key_id: row.device_key_id,
      wrapped_dek: bytesToBase64Url(wrapped),
    });
  }
  return wrapped_deks;
}

export async function createEncryptedPastePayload(
  title: string,
  content: string,
  deviceKeys: DeviceKeyRow[],
): Promise<{
  encrypted_title: string;
  encrypted_content: string;
  wrapped_deks: { device_key_id: string; wrapped_dek: string }[];
}> {
  if (deviceKeys.length === 0) {
    throw new Error("no device keys to encrypt for");
  }
  const dek = await generateDek();
  const titleBlob = await encryptUtf8(title, dek);
  const contentBlob = await encryptUtf8(content, dek);
  const wrapped_deks: { device_key_id: string; wrapped_dek: string }[] = [];
  for (const row of deviceKeys) {
    const spki = base64UrlToBytes(row.public_key);
    const wrapped = await wrapDekForRecipient(dek, spki);
    wrapped_deks.push({
      device_key_id: row.device_key_id,
      wrapped_dek: bytesToBase64Url(wrapped),
    });
  }
  return {
    encrypted_title: bytesToBase64Url(titleBlob),
    encrypted_content: bytesToBase64Url(contentBlob),
    wrapped_deks,
  };
}

export async function decryptTitleFromMetadata(
  encryptedTitleB64: string,
  wrappedDekB64: string,
  devicePrivateKey: CryptoKey,
): Promise<string> {
  const dek = await unwrapDek(base64UrlToBytes(wrappedDekB64), devicePrivateKey);
  return decryptUtf8(base64UrlToBytes(encryptedTitleB64), dek);
}

export async function decryptFullPaste(
  encryptedTitleB64: string,
  encryptedContentB64: string,
  wrappedDekB64: string,
  devicePrivateKey: CryptoKey,
): Promise<{ title: string; content: string }> {
  const dek = await unwrapDek(base64UrlToBytes(wrappedDekB64), devicePrivateKey);
  const title = await decryptUtf8(base64UrlToBytes(encryptedTitleB64), dek);
  const content = await decryptUtf8(base64UrlToBytes(encryptedContentB64), dek);
  return { title, content };
}
