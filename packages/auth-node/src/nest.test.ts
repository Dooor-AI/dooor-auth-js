import "reflect-metadata";
import { createServer, type Server } from "node:http";
import { Reflector } from "@nestjs/core";
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { __resetJwksCacheForTests } from "./verify.js";
import { DooorAuthGuard, DooorAuthModule, DooorRoles, Public } from "./nest.js";
import type { DooorTokenPayload } from "./types.js";

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
  jwk.kid = "kid-nest";
  jwk.alg = "RS256";
  jwks = [jwk];

  signToken = (claims = {}) =>
    new SignJWT({ token_use: "access", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "kid-nest" })
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

/** Minimal ExecutionContext over a request object, as the HTTP adapters provide it. */
function executionContext(
  request: { headers: Record<string, string>; dooor?: DooorTokenPayload },
  handler: () => void = () => {},
  controller: new () => unknown = class {},
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

function guard(options: Record<string, unknown> = {}) {
  return new DooorAuthGuard(new Reflector(), {
    audience,
    issuer,
    jwksUrl: `${baseUrl}/jwks.json`,
    ...options,
  });
}

describe("DooorAuthGuard", () => {
  it("verifies the bearer token and attaches claims to request.dooor", async () => {
    const request = { headers: { authorization: `Bearer ${await signToken()}` } } as {
      headers: Record<string, string>;
      dooor?: DooorTokenPayload;
    };

    await expect(guard().canActivate(executionContext(request))).resolves.toBe(true);
    expect(request.dooor?.sub).toBe("usr_1");
  });

  it("throws UnauthorizedException when the token is missing", async () => {
    await expect(guard().canActivate(executionContext({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws UnauthorizedException for a token signed by an unknown key", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const forged = await new SignJWT({ token_use: "access" })
      .setProtectedHeader({ alg: "RS256", kid: "kid-nest" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("usr_evil")
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(
      guard().canActivate(executionContext({ headers: { authorization: `Bearer ${forged}` } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws ForbiddenException when @DooorRoles is not satisfied", async () => {
    class ReportsController {}
    const handler = () => {};
    DooorRoles("admin")(ReportsController.prototype, "find", { value: handler });

    const request = { headers: { authorization: `Bearer ${await signToken({ roles: ["viewer"] })}` } };

    await expect(
      guard().canActivate(executionContext(request, handler, ReportsController)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a handler whose @DooorRoles requirement is met", async () => {
    class ReportsController {}
    const handler = () => {};
    DooorRoles("admin")(ReportsController.prototype, "find", { value: handler });

    const request = { headers: { authorization: `Bearer ${await signToken({ roles: ["admin", "viewer"] })}` } };

    await expect(guard().canActivate(executionContext(request, handler, ReportsController))).resolves.toBe(true);
  });

  it("skips verification entirely for @Public handlers", async () => {
    class HealthController {}
    const handler = () => {};
    Public()(HealthController.prototype, "check", { value: handler });

    await expect(
      guard().canActivate(executionContext({ headers: {} }, handler, HealthController)),
    ).resolves.toBe(true);
  });
});

describe("DooorAuthModule", () => {
  it("registers globally and exports the guard and its options", () => {
    const module = DooorAuthModule.forRoot({ audience });

    expect(module.global).toBe(true);
    expect(module.exports).toContain(DooorAuthGuard);
    expect(module.providers).toContainEqual({ provide: "DOOOR_AUTH_OPTIONS", useValue: { audience } });
  });
});
