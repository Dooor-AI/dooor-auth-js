import { describe, expect, it } from "vitest";
import { auth, currentUser, getToken, requireAuth } from "./session.js";
import { encryptCookiePayload } from "./cookie-crypto.js";
import type { SessionCookiePayload } from "./config.js";

const cookieSecret = "test-cookie-secret-with-at-least-32-characters";

const user = { id: "usr_1", email: "ada@example.com", name: "Ada", roles: ["admin"], orgId: "org_1" };

async function requestWithSession(session: Partial<SessionCookiePayload>): Promise<Request> {
  const payload: SessionCookiePayload = {
    accessToken: "at_live",
    expiresAt: Date.now() + 5 * 60_000,
    user,
    ...session,
  };
  return new Request("https://miniapp.example.test/reports", {
    headers: { cookie: `dooor_session=${await encryptCookiePayload(cookieSecret, payload)}` },
  });
}

describe("auth()", () => {
  it("projects the session cookie into a server-side session", async () => {
    const session = await auth({ cookieSecret, request: await requestWithSession({}) });

    expect(session).toMatchObject({
      isSignedIn: true,
      userId: "usr_1",
      orgId: "org_1",
      roles: ["admin"],
      accessToken: "at_live",
      isExpired: false,
    });
  });

  it("reports signed out when no cookie is present", async () => {
    const session = await auth({
      cookieSecret,
      request: new Request("https://miniapp.example.test/reports"),
    });
    expect(session).toMatchObject({ isSignedIn: false, userId: null, accessToken: null, roles: [] });
  });

  it("withholds an expired access token instead of handing out a token the backend would reject", async () => {
    const session = await auth({
      cookieSecret,
      request: await requestWithSession({ expiresAt: Date.now() - 1_000 }),
    });

    expect(session.isSignedIn).toBe(false);
    expect(session.isExpired).toBe(true);
    expect(session.accessToken).toBeNull();
    expect(session.expiresAt).toBeLessThan(Date.now());
  });

  it("treats a token inside the expiry skew as expired", async () => {
    const session = await auth({
      cookieSecret,
      request: await requestWithSession({ expiresAt: Date.now() + 5_000 }),
    });
    expect(session.isExpired).toBe(true);
  });

  it("returns signed out for a forged cookie", async () => {
    const session = await auth({
      cookieSecret,
      request: new Request("https://miniapp.example.test/reports", {
        headers: { cookie: "dooor_session=not-a-real-cookie" },
      }),
    });
    expect(session.isSignedIn).toBe(false);
  });

  it("accepts a raw Cookie header string as the source", async () => {
    const cookie = (await requestWithSession({})).headers.get("cookie")!;
    const session = await auth({ cookieSecret, request: cookie });
    expect(session.userId).toBe("usr_1");
  });

  it("honours a custom cookie name", async () => {
    const payload = await encryptCookiePayload(cookieSecret, {
      accessToken: "at_live",
      expiresAt: Date.now() + 60_000,
      user,
    } satisfies SessionCookiePayload);

    const session = await auth({
      cookieSecret,
      cookieName: "app_session",
      request: `app_session=${payload}`,
    });
    expect(session.isSignedIn).toBe(true);
  });

  it("fails closed when no cookie secret is configured", async () => {
    const session = await auth({ cookieSecret: undefined, request: await requestWithSession({}) });
    expect(session.isSignedIn).toBe(false);
  });
});

describe("currentUser() / getToken() / requireAuth()", () => {
  it("currentUser returns the profile", async () => {
    await expect(currentUser({ cookieSecret, request: await requestWithSession({}) })).resolves.toMatchObject({
      email: "ada@example.com",
    });
  });

  it("getToken returns the bearer token to forward to your backend", async () => {
    await expect(getToken({ cookieSecret, request: await requestWithSession({}) })).resolves.toBe("at_live");
  });

  it("getToken returns null once the token has expired", async () => {
    await expect(
      getToken({ cookieSecret, request: await requestWithSession({ expiresAt: Date.now() - 1 }) }),
    ).resolves.toBeNull();
  });

  it("requireAuth throws when signed out", async () => {
    await expect(
      requireAuth({ cookieSecret, request: new Request("https://miniapp.example.test/reports") }),
    ).rejects.toThrow(/No Dooor Auth session/);
  });

  it("requireAuth returns the session when signed in", async () => {
    await expect(requireAuth({ cookieSecret, request: await requestWithSession({}) })).resolves.toMatchObject({
      userId: "usr_1",
    });
  });
});
