import { describe, expect, it } from "vitest";
import { createPkcePair, generateCodeChallenge, generateCodeVerifier, generateState } from "./pkce.js";

describe("generateCodeVerifier", () => {
  it("produces a base64url string within the RFC 7636 length range", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("never repeats across calls", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toEqual(b);
  });

  it("rejects out-of-range byte lengths", () => {
    expect(() => generateCodeVerifier(10)).toThrow(/byteLength must be between/);
    expect(() => generateCodeVerifier(200)).toThrow(/byteLength must be between/);
  });
});

describe("generateCodeChallenge (S256)", () => {
  it("matches the known RFC 7636 appendix B vector", async () => {
    // https://datatracker.ietf.org/doc/html/rfc7636#appendix-B
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("is deterministic for the same verifier", async () => {
    const verifier = generateCodeVerifier();
    const [a, b] = await Promise.all([generateCodeChallenge(verifier), generateCodeChallenge(verifier)]);
    expect(a).toBe(b);
  });

  it("is different for different verifiers", async () => {
    const [a, b] = await Promise.all([
      generateCodeChallenge(generateCodeVerifier()),
      generateCodeChallenge(generateCodeVerifier()),
    ]);
    expect(a).not.toBe(b);
  });
});

describe("createPkcePair", () => {
  it("returns a verifier/challenge pair using the S256 method", async () => {
    const pair = await createPkcePair();
    expect(pair.codeChallengeMethod).toBe("S256");
    expect(await generateCodeChallenge(pair.codeVerifier)).toBe(pair.codeChallenge);
  });
});

describe("generateState", () => {
  it("produces an unguessable, unique opaque string", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(16);
  });
});
