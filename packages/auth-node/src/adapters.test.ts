import { createServer, type Server } from "node:http";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { __resetJwksCacheForTests } from "./verify.js";
import { dooorAuthHook, type DooorFastifyReply, type DooorFastifyRequest } from "./fastify.js";
import { requireDooorAuth, type DooorAuthRequest, type DooorAuthResponseLike } from "./express.js";

const issuer = "https://auth.dooor.test";
const audience = "app_test123";

let server: Server;
let baseUrl: string;
let jwks: JWK[] = [];
let signToken: (claims?: Record<string, unknown>) => Promise<string>;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: jwks }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "kid-adapters";
  jwk.alg = "RS256";
  jwks = [jwk];

  signToken = (claims = {}) =>
    new SignJWT({ token_use: "access", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "kid-adapters" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("usr_1")
      .setExpirationTime("5m")
      .sign(privateKey);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  __resetJwksCacheForTests();
});

function guardOptions() {
  return { audience, issuer, jwksUrl: `${baseUrl}/jwks.json` };
}

function fastifyReply(): DooorFastifyReply & { statusCode?: number; payload?: unknown } {
  const reply: DooorFastifyReply & { statusCode?: number; payload?: unknown } = {
    code(statusCode: number) {
      reply.statusCode = statusCode;
      return reply;
    },
    send(payload: unknown) {
      reply.payload = payload;
      return payload;
    },
  };
  return reply;
}

describe("dooorAuthHook (fastify adapter)", () => {
  it("attaches request.dooor for a valid bearer token", async () => {
    const hook = dooorAuthHook(guardOptions());
    const request: DooorFastifyRequest = { headers: { authorization: `Bearer ${await signToken()}` } };
    const reply = fastifyReply();

    await hook(request, reply);

    expect(request.dooor?.sub).toBe("usr_1");
    expect(reply.statusCode).toBeUndefined();
  });

  it("replies 401 when the token is missing", async () => {
    const hook = dooorAuthHook(guardOptions());
    const reply = fastifyReply();

    await hook({ headers: {} }, reply);

    expect(reply.statusCode).toBe(401);
    expect(reply.payload).toMatchObject({ error: "unauthorized" });
  });

  it("replies 403 when the token is valid but lacks the role", async () => {
    const hook = dooorAuthHook({ ...guardOptions(), roles: ["admin"] });
    const request: DooorFastifyRequest = {
      headers: { authorization: `Bearer ${await signToken({ roles: ["viewer"] })}` },
    };
    const reply = fastifyReply();

    await hook(request, reply);

    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toMatchObject({ error: "forbidden" });
  });

  it("lets a role-carrying token through", async () => {
    const hook = dooorAuthHook({ ...guardOptions(), roles: ["admin"] });
    const request: DooorFastifyRequest = {
      headers: { authorization: `Bearer ${await signToken({ roles: ["admin"] })}` },
    };
    const reply = fastifyReply();

    await hook(request, reply);

    expect(reply.statusCode).toBeUndefined();
    expect(request.dooor?.roles).toEqual(["admin"]);
  });

  it("stays silent when optional and the token is absent", async () => {
    const hook = dooorAuthHook({ ...guardOptions(), optional: true });
    const request: DooorFastifyRequest = { headers: {} };
    const reply = fastifyReply();

    await hook(request, reply);

    expect(reply.statusCode).toBeUndefined();
    expect(request.dooor).toBeUndefined();
  });
});

describe("requireDooorAuth role checks (express adapter)", () => {
  function fakeResponse(): DooorAuthResponseLike & { statusCode?: number; body?: unknown } {
    const res: DooorAuthResponseLike & { statusCode?: number; body?: unknown } = {
      status(code: number) {
        res.statusCode = code;
        return { json: (body: unknown) => (res.body = body) };
      },
    };
    return res;
  }

  it("responds 403 (not 401) for an authenticated principal missing the role", async () => {
    const middleware = requireDooorAuth({ ...guardOptions(), roles: ["admin"] });
    const req: DooorAuthRequest = { headers: { authorization: `Bearer ${await signToken({ roles: ["viewer"] })}` } };
    const res = fakeResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("requires every role when requireAllRoles is set", async () => {
    const middleware = requireDooorAuth({ ...guardOptions(), roles: ["admin", "billing"], requireAllRoles: true });
    const req: DooorAuthRequest = { headers: { authorization: `Bearer ${await signToken({ roles: ["admin"] })}` } };
    const res = fakeResponse();

    await middleware(req, res, vi.fn());

    expect(res.statusCode).toBe(403);
  });
});
