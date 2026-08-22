const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * AES-256-GCM sealing for the session and transaction cookies, built on Web
 * Crypto so the exact same code runs in the Node.js BFF, in Server Components,
 * and in the Edge middleware. Using `node:crypto` here would pull a Node
 * builtin into the Edge bundle, which Next.js rejects.
 *
 * Wire format: `base64url(iv || authTag || ciphertext)`.
 */

function decodeBase64Url(raw: string): Uint8Array {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 gives a 32-byte key regardless of the raw secret's length or format. */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypts a JSON-serializable payload, keyed off `DOOOR_AUTH_COOKIE_SECRET`. */
export async function encryptCookiePayload(secret: string, payload: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: AUTH_TAG_LENGTH * 8 },
      await deriveKey(secret),
      plaintext,
    ),
  );

  // Web Crypto appends the auth tag to the ciphertext; the wire format keeps it up front.
  const ciphertext = sealed.slice(0, sealed.length - AUTH_TAG_LENGTH);
  const authTag = sealed.slice(sealed.length - AUTH_TAG_LENGTH);

  const output = new Uint8Array(IV_LENGTH + AUTH_TAG_LENGTH + ciphertext.length);
  output.set(iv, 0);
  output.set(authTag, IV_LENGTH);
  output.set(ciphertext, IV_LENGTH + AUTH_TAG_LENGTH);
  return encodeBase64Url(output);
}

/** Decrypts a payload produced by `encryptCookiePayload`. Returns `undefined` on any tamper/format error instead of throwing. */
export async function decryptCookiePayload<T>(secret: string, raw: string): Promise<T | undefined> {
  try {
    const encoded = decodeBase64Url(raw);
    if (encoded.length < IV_LENGTH + AUTH_TAG_LENGTH) return undefined;

    const iv = encoded.slice(0, IV_LENGTH);
    const authTag = encoded.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encoded.slice(IV_LENGTH + AUTH_TAG_LENGTH);

    const sealed = new Uint8Array(ciphertext.length + authTag.length);
    sealed.set(ciphertext);
    sealed.set(authTag, ciphertext.length);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: AUTH_TAG_LENGTH * 8 },
      await deriveKey(secret),
      sealed,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return undefined;
  }
}
