"use client";

import { argon2id } from "@noble/hashes/argon2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { base64UrlToBytes, bytesToBase64Url } from "./b64url";
import { decryptUtf8, encryptUtf8, generateDek } from "./e2ee-paste";

export type PasswordKdfParams = {
  salt: string;
  memory_kib: number;
  iterations: number;
  parallelism: number;
  derived_key_length: number;
};

export const DEFAULT_ARGON2ID: Omit<PasswordKdfParams, "salt"> = {
  memory_kib: 64 * 1024,
  iterations: 3,
  parallelism: 1,
  derived_key_length: 32,
};

async function importAesGcmKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function derivePasswordKey(password: string, params: PasswordKdfParams): Promise<Uint8Array> {
  return argon2id(utf8ToBytes(password), base64UrlToBytes(params.salt), {
    t: params.iterations,
    m: params.memory_kib,
    p: params.parallelism,
    dkLen: params.derived_key_length,
  });
}

export async function createShareablePayload(
  title: string,
  content: string,
): Promise<{ encrypted_title: string; encrypted_content: string; raw_dek_b64: string }> {
  const dek = await generateDek();
  const titleBlob = await encryptUtf8(title, dek);
  const contentBlob = await encryptUtf8(content, dek);
  const rawDek = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
  return {
    encrypted_title: bytesToBase64Url(titleBlob),
    encrypted_content: bytesToBase64Url(contentBlob),
    raw_dek_b64: bytesToBase64Url(rawDek),
  };
}

export async function createPasswordWrappedDek(
  rawDekB64: string,
  password: string,
): Promise<{ share_wrap_nonce: string; share_wrap_blob: string; password_kdf: PasswordKdfParams }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const params: PasswordKdfParams = {
    ...DEFAULT_ARGON2ID,
    salt: bytesToBase64Url(salt),
  };
  const derivedKey = await derivePasswordKey(password, params);
  const wrapKey = await importAesGcmKey(derivedKey, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      wrapKey,
      base64UrlToBytes(rawDekB64) as BufferSource,
    ),
  );
  return {
    share_wrap_nonce: bytesToBase64Url(nonce),
    share_wrap_blob: bytesToBase64Url(ciphertext),
    password_kdf: params,
  };
}

async function importDekFromRaw(rawDekB64: string): Promise<CryptoKey> {
  return importAesGcmKey(base64UrlToBytes(rawDekB64), ["decrypt"]);
}

export async function decryptSharedPasteContent(input: {
  encrypted_title: string;
  encrypted_content: string;
  visibility_mode: "public" | "password";
  share_wrap_blob: string;
  share_wrap_nonce?: string;
  password_kdf?: PasswordKdfParams;
  password?: string;
}): Promise<{ title: string; content: string }> {
  let dek: CryptoKey;
  if (input.visibility_mode === "public") {
    dek = await importDekFromRaw(input.share_wrap_blob);
  } else {
    if (!input.password || !input.share_wrap_nonce || !input.password_kdf) {
      throw new Error("Missing password fields");
    }
    const keyBytes = await derivePasswordKey(input.password, input.password_kdf);
    const unwrapKey = await importAesGcmKey(keyBytes, ["decrypt"]);
    const rawDek = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(input.share_wrap_nonce) as BufferSource },
      unwrapKey,
      base64UrlToBytes(input.share_wrap_blob) as BufferSource,
    );
    dek = await importAesGcmKey(new Uint8Array(rawDek), ["decrypt"]);
  }
  const title = await decryptUtf8(base64UrlToBytes(input.encrypted_title), dek);
  const content = await decryptUtf8(base64UrlToBytes(input.encrypted_content), dek);
  return { title, content };
}
