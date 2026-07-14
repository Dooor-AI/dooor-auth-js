import { DooorAuthError, type PkcePair } from "./types.js";

/**
 * Resolves the Web Crypto API (`crypto.subtle`), available natively in
 * browsers and in Node.js >= 18.17 as a global. No Node-specific import is
 * used so this module stays bundler-safe for browser builds.
 */
function getWebCrypto(): Crypto {
  const candidate = (globalThis as { crypto?: Crypto }).crypto;
  if (!candidate?.subtle) {
    throw new DooorAuthError(
      "Web Crypto API not available. Use Node.js >= 18.17 or a browser with `crypto.subtle` support.",
      "crypto_unavailable",
    );
  }
  return candidate;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // `btoa` is available in browsers and Node.js >= 16 (global).
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generates a PKCE `code_verifier` per RFC 7636 (43-128 char base64url string).
 * `byteLength` controls entropy; 32-96 bytes keep the encoded output in range.
 */
export function generateCodeVerifier(byteLength = 32): string {
  if (byteLength < 32 || byteLength > 96) {
    throw new DooorAuthError(
      "byteLength must be between 32 and 96 to produce a valid RFC 7636 code_verifier",
      "invalid_pkce_length",
    );
  }
  const bytes = new Uint8Array(byteLength);
  getWebCrypto().getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Derives the S256 `code_challenge` from a `code_verifier` (RFC 7636 §4.2). */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const crypto = getWebCrypto();
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/** Generates a fresh `{ codeVerifier, codeChallenge }` pair using the S256 method. */
export async function createPkcePair(byteLength = 32): Promise<PkcePair> {
  const codeVerifier = generateCodeVerifier(byteLength);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

/** Generates an opaque, unguessable `state` value to bind the authorize request to its callback. */
export function generateState(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  getWebCrypto().getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
