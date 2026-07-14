import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  // SHA-256 gives a 32-byte key regardless of the raw secret's length/format.
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Encrypts a JSON-serializable payload with AES-256-GCM, keyed off `DOOOR_AUTH_COOKIE_SECRET`. */
export function encryptCookiePayload(secret: string, payload: unknown): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

/** Decrypts a payload produced by `encryptCookiePayload`. Returns `undefined` on any tamper/format/expiry error instead of throwing. */
export function decryptCookiePayload<T>(secret: string, raw: string): T | undefined {
  try {
    const key = deriveKey(secret);
    const buffer = Buffer.from(raw, "base64url");
    if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) return undefined;

    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return undefined;
  }
}
