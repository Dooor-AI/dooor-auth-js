const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function decodeBase64Url(raw: string): Uint8Array {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

/** Decrypts the AES-256-GCM session cookie using Web Crypto, including Edge runtimes. */
export async function decryptCookiePayloadWeb<T>(secret: string, raw: string): Promise<T | undefined> {
  try {
    const encoded = decodeBase64Url(raw);
    if (encoded.length < IV_LENGTH + AUTH_TAG_LENGTH) return undefined;

    const iv = encoded.slice(0, IV_LENGTH);
    const authTag = encoded.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encoded.slice(IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertextWithTag = new Uint8Array(encrypted.length + authTag.length);
    ciphertextWithTag.set(encrypted);
    ciphertextWithTag.set(authTag, encrypted.length);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: AUTH_TAG_LENGTH * 8 },
      await deriveKey(secret),
      ciphertextWithTag,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return undefined;
  }
}
