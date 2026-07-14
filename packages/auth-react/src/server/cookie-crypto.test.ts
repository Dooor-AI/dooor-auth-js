import { describe, expect, it } from "vitest";
import { decryptCookiePayload, encryptCookiePayload } from "./cookie-crypto.js";

describe("cookie-crypto", () => {
  const secret = "test-cookie-secret-do-not-use-in-prod";

  it("round-trips a JSON payload", () => {
    const payload = { refreshToken: "dor_rt_abc", expiresAt: 12345, nested: { ok: true } };
    const encrypted = encryptCookiePayload(secret, payload);
    expect(decryptCookiePayload(secret, encrypted)).toEqual(payload);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const payload = { a: 1 };
    const first = encryptCookiePayload(secret, payload);
    const second = encryptCookiePayload(secret, payload);
    expect(first).not.toEqual(second);
  });

  it("fails closed (returns undefined) when decrypted with the wrong secret", () => {
    const encrypted = encryptCookiePayload(secret, { a: 1 });
    expect(decryptCookiePayload("a-completely-different-secret", encrypted)).toBeUndefined();
  });

  it("fails closed when the ciphertext is tampered with", () => {
    const encrypted = encryptCookiePayload(secret, { a: 1 });
    const buffer = Buffer.from(encrypted, "base64url");
    const lastIndex = buffer.length - 1;
    buffer[lastIndex] = (buffer[lastIndex] ?? 0) ^ 0xff; // flip the last byte of the ciphertext
    const tampered = buffer.toString("base64url");
    expect(decryptCookiePayload(secret, tampered)).toBeUndefined();
  });

  it("fails closed on garbage input", () => {
    expect(decryptCookiePayload(secret, "not-a-valid-cookie")).toBeUndefined();
  });
});
