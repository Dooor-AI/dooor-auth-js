import { createServer, type Server } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { __resetJwksCacheForTests } from "./verify.js";
import { requireDooorAuth, type DooorAuthRequest, type DooorAuthResponseLike } from "./express.js";

describe("requireDooorAuth (express adapter)", () => {
  const issuer = "https://auth.dooor.test";
  const audience = "app_test123";

  let server: Server;
  let baseUrl: string;
  let jwks: Record<string, unknown>[] = [];

  beforeAll(async () => {
    server = createServer((_req, res) => {
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
  });

  function fakeResponse(): DooorAuthResponseLike & { statusCode?: number; body?: unknown } {
    const res: DooorAuthResponseLike & { statusCode?: number; body?: unknown } = {
      status(code: number) {
        res.statusCode = code;
        return { json: (body: unknown) => (res.body = body) };
      },
    };
    return res;
  }

  it("attaches req.dooor and calls next() for a valid bearer token", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "kid-express";
    jwk.alg = "RS256";
    jwks = [jwk];

    const token = await new SignJWT({ email: "user@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "kid-express" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("usr_1")
      .setExpirationTime("5m")
      .sign(privateKey);

    const middleware = requireDooorAuth({ audience, issuer, jwksUrl: `${baseUrl}/jwks.json` });
    const req: DooorAuthRequest = { headers: { authorization: `Bearer ${token}` } };
    const res = fakeResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.dooor?.sub).toBe("usr_1");
    expect(res.statusCode).toBeUndefined();
  });

  it("responds 401 when the bearer token is missing", async () => {
    const middleware = requireDooorAuth({ audience, issuer, jwksUrl: `${baseUrl}/jwks.json` });
    const req: DooorAuthRequest = { headers: {} };
    const res = fakeResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("calls next() without a body when optional and the token is missing", async () => {
    const middleware = requireDooorAuth({ audience, issuer, jwksUrl: `${baseUrl}/jwks.json`, optional: true });
    const req: DooorAuthRequest = { headers: {} };
    const res = fakeResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
    expect(req.dooor).toBeUndefined();
  });
});
