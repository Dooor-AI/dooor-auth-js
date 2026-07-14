import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  __resetJwksCacheForTests,
  verifyDooorToken,
} from "./index.js";

describe("verifyDooorToken", () => {
  let closeServer: () => Promise<void>;
  let jwksUrl: string;
  let privateKey: CryptoKey;
  let kid: string;

  beforeAll(async () => {
    __resetJwksCacheForTests();
    kid = "test-kid";
    const { privateKey: priv, publicKey } = await generateKeyPair("RS256");
    privateKey = priv;
    const jwk = await exportJWK(publicKey);
    jwk.kid = kid;
    jwk.alg = "RS256";
    jwk.use = "sig";

    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    jwksUrl = `http://127.0.0.1:${addr.port}/jwks.json`;
    closeServer = () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
  });

  afterAll(async () => {
    await closeServer();
    __resetJwksCacheForTests();
  });

  async function mint(aud: string) {
    return new SignJWT({
      sid: "ases_1",
      realm: "platform",
      app_user: "apu_1",
      org: "ws_1",
      email: "user@example.com",
      roles: ["member"],
    })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer("https://auth.dooor.ai")
      .setSubject("usr_1")
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  it("verifies a valid RS256 token against JWKS", async () => {
    const token = await mint("app_xyz");
    const claims = await verifyDooorToken(token, {
      audience: "app_xyz",
      issuer: "https://auth.dooor.ai",
      jwksUrl,
    });
    expect(claims.sub).toBe("usr_1");
    expect(claims.email).toBe("user@example.com");
    expect(claims.aud).toBe("app_xyz");
  });

  it("rejects wrong audience", async () => {
    const token = await mint("app_xyz");
    await expect(
      verifyDooorToken(token, {
        audience: "app_other",
        issuer: "https://auth.dooor.ai",
        jwksUrl,
      }),
    ).rejects.toThrow(/aud|audience|Invalid Dooor Auth token/i);
  });
});
