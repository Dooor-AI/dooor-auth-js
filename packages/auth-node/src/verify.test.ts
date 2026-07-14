import { createServer, type Server } from "node:http";
import { DooorAuthError } from "@dooor-ai/auth-core";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { __resetJwksCacheForTests, verifyDooorToken } from "./verify.js";

interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  jwk: Record<string, unknown>;
}

async function createRsaKey(kid: string): Promise<TestKey> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { kid, privateKey: privateKey as CryptoKey, jwk };
}

describe("verifyDooorToken", () => {
  const issuer = "https://auth.dooor.test";
  const audience = "app_test123";

  let server: Server;
  let baseUrl: string;
  let jwks: Record<string, unknown>[] = [];
  let fetchCount = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      fetchCount += 1;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: jwks }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    __resetJwksCacheForTests();
    fetchCount = 0;
    delete process.env.DOOOR_AUTH_APP_ID;
  });

  async function signToken(
    privateKey: CryptoKey,
    kid: string,
    claimsOverride: Record<string, unknown> = {},
  ): Promise<string> {
    return new SignJWT({ email: "user@example.com", roles: ["member"], realm: "platform", ...claimsOverride })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("usr_123")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  it("verifies a valid token against the mocked JWKS", async () => {
    const key = await createRsaKey("kid-1");
    jwks = [key.jwk];
    const token = await signToken(key.privateKey, key.kid);

    const payload = await verifyDooorToken(token, { audience, issuer, jwksUrl: `${baseUrl}/jwks-1.json` });
    expect(payload.sub).toBe("usr_123");
    expect(payload.email).toBe("user@example.com");
    expect(payload.aud).toBe(audience);
  });

  it("caches the JWKS by kid and does not refetch on repeated verification", async () => {
    const key = await createRsaKey("kid-cache");
    jwks = [key.jwk];
    const token = await signToken(key.privateKey, key.kid);
    const jwksUrl = `${baseUrl}/jwks-cache.json`;

    await verifyDooorToken(token, { audience, issuer, jwksUrl });
    const countAfterFirst = fetchCount;
    await verifyDooorToken(token, { audience, issuer, jwksUrl });
    expect(fetchCount).toBe(countAfterFirst);
  });

  it("refetches JWKS when an unknown kid is presented (key rotation)", async () => {
    const jwksUrl = `${baseUrl}/jwks-rotation.json`;
    const key1 = await createRsaKey("kid-a");
    jwks = [key1.jwk];
    const token1 = await signToken(key1.privateKey, key1.kid);
    await verifyDooorToken(token1, { audience, issuer, jwksUrl });
    const countAfterFirst = fetchCount;

    const key2 = await createRsaKey("kid-b");
    jwks = [key1.jwk, key2.jwk]; // rotation publishes NEXT alongside ACTIVE
    const token2 = await signToken(key2.privateKey, key2.kid);

    const payload = await verifyDooorToken(token2, { audience, issuer, jwksUrl });
    expect(payload.sub).toBe("usr_123");
    expect(fetchCount).toBeGreaterThan(countAfterFirst);
  });

  it("rejects a token with the wrong audience", async () => {
    const key = await createRsaKey("kid-aud");
    jwks = [key.jwk];
    const token = await signToken(key.privateKey, key.kid);

    await expect(
      verifyDooorToken(token, { audience: "app_other", issuer, jwksUrl: `${baseUrl}/jwks-aud.json` }),
    ).rejects.toThrow(DooorAuthError);
  });

  it("rejects a token signed by a kid absent from the JWKS", async () => {
    const key = await createRsaKey("kid-known");
    const strangerKey = await createRsaKey("kid-stranger");
    jwks = [key.jwk]; // stranger key never published
    const token = await signToken(strangerKey.privateKey, strangerKey.kid);

    await expect(
      verifyDooorToken(token, { audience, issuer, jwksUrl: `${baseUrl}/jwks-unknown.json` }),
    ).rejects.toThrow(DooorAuthError);
  });

  it("resolves audience from DOOOR_AUTH_APP_ID when not passed explicitly", async () => {
    const key = await createRsaKey("kid-env");
    jwks = [key.jwk];
    const token = await signToken(key.privateKey, key.kid);
    process.env.DOOOR_AUTH_APP_ID = audience;

    const payload = await verifyDooorToken(token, { issuer, jwksUrl: `${baseUrl}/jwks-env.json` });
    expect(payload.sub).toBe("usr_123");
  });

  it("throws when no audience is provided or configured via env", async () => {
    const key = await createRsaKey("kid-noaud");
    jwks = [key.jwk];
    const token = await signToken(key.privateKey, key.kid);

    await expect(verifyDooorToken(token, { issuer, jwksUrl: `${baseUrl}/jwks-noaud.json` })).rejects.toThrow(
      /audience is required/,
    );
  });

  it("rejects a forged alg:none token", async () => {
    const key = await createRsaKey("kid-none");
    jwks = [key.jwk];

    const header = Buffer.from(JSON.stringify({ alg: "none", kid: key.kid })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iss: issuer, aud: audience, sub: "usr_123", exp: Math.floor(Date.now() / 1000) + 300 }),
    ).toString("base64url");
    const forged = `${header}.${payload}.`;

    await expect(
      verifyDooorToken(forged, { audience, issuer, jwksUrl: `${baseUrl}/jwks-none.json` }),
    ).rejects.toThrow(DooorAuthError);
  });

  it("rejects an HS256-signed token (symmetric downgrade attempt)", async () => {
    const key = await createRsaKey("kid-hs256");
    jwks = [key.jwk];

    const forged = await new SignJWT({ sub: "usr_123" })
      .setProtectedHeader({ alg: "HS256", kid: key.kid })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("guessed-public-key-as-hmac-secret"));

    await expect(
      verifyDooorToken(forged, { audience, issuer, jwksUrl: `${baseUrl}/jwks-hs256.json` }),
    ).rejects.toThrow(DooorAuthError);
  });
});
