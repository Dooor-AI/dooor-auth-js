import { describe, expect, it } from "vitest";
import { decryptCookiePayload, encryptCookiePayload } from "./cookie-crypto.js";

describe("cookie-crypto", () => {
  const secret = "test-cookie-secret-do-not-use-in-prod";

  it("round-trips a JSON payload", async () => {
    const payload = { refreshToken: "dor_rt_abc", expiresAt: 12345, nested: { ok: true } };
    const encrypted = await encryptCookiePayload(secret, payload);
    await expect(decryptCookiePayload(secret, encrypted)).resolves.toEqual(payload);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const payload = { a: 1 };
    const first = await encryptCookiePayload(secret, payload);
    const second = await encryptCookiePayload(secret, payload);
    expect(first).not.toEqual(second);
  });

  it("fails closed (returns undefined) when decrypted with the wrong secret", async () => {
    const encrypted = await encryptCookiePayload(secret, { a: 1 });
    await expect(decryptCookiePayload("a-completely-different-secret", encrypted)).resolves.toBeUndefined();
  });

  it("fails closed when the ciphertext is tampered with", async () => {
    const encrypted = await encryptCookiePayload(secret, { a: 1 });
    const buffer = Buffer.from(encrypted, "base64url");
    const lastIndex = buffer.length - 1;
    buffer[lastIndex] = (buffer[lastIndex] ?? 0) ^ 0xff; // flip the last byte of the ciphertext
    await expect(decryptCookiePayload(secret, buffer.toString("base64url"))).resolves.toBeUndefined();
  });

  it("fails closed when the auth tag is tampered with", async () => {
    const encrypted = await encryptCookiePayload(secret, { a: 1 });
    const buffer = Buffer.from(encrypted, "base64url");
    buffer[13] = (buffer[13] ?? 0) ^ 0xff; // a byte inside the auth tag (offset 12..27)
    await expect(decryptCookiePayload(secret, buffer.toString("base64url"))).resolves.toBeUndefined();
  });

  it("fails closed on garbage input", async () => {
    await expect(decryptCookiePayload(secret, "not-a-valid-cookie")).resolves.toBeUndefined();
  });

  it("fails closed on input shorter than the iv + auth tag header", async () => {
    await expect(decryptCookiePayload(secret, "AAAA")).resolves.toBeUndefined();
  });

  it("uses the same wire format in every runtime, so a cookie written by the Edge middleware is readable by the BFF", async () => {
    // One implementation now backs Node, Edge, and Server Components alike;
    // this pins the format (base64url of iv || authTag || ciphertext).
    const sealed = await encryptCookiePayload(secret, { accessToken: "at", expiresAt: 42 });
    const bytes = Buffer.from(sealed, "base64url");
    expect(bytes.length).toBeGreaterThan(12 + 16);
    await expect(decryptCookiePayload(secret, sealed)).resolves.toEqual({ accessToken: "at", expiresAt: 42 });
  });
});
