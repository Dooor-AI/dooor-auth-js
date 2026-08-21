import { afterEach, describe, expect, it, vi } from "vitest";
import { dooorAuthMiddleware } from "./middleware.js";
import { decryptCookiePayload, encryptCookiePayload } from "./cookie-crypto.js";

const cookieSecret = "test-cookie-secret-with-at-least-32-characters";

function request(pathname: string, cookie?: string): Request {
  return new Request(`https://my-app.example.com${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("dooorAuthMiddleware", () => {
  it("lets requests to the BFF routes through untouched", async () => {
    const middleware = dooorAuthMiddleware();
    await expect(middleware(request("/api/dooor-auth/session"))).resolves.toBeUndefined();
  });

  it("lets exact public routes through without a session cookie", async () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/"] });
    await expect(middleware(request("/"))).resolves.toBeUndefined();
  });

  it("matches wildcard public routes with the (.*) suffix", async () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/sign-in(.*)"] });
    await expect(middleware(request("/sign-in"))).resolves.toBeUndefined();
    await expect(middleware(request("/sign-in/help"))).resolves.toBeUndefined();
  });

  it("redirects to the sign-in path when the session cookie is absent on a protected route", async () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/"], cookieSecret });
    const response = await middleware(request("/dashboard"));

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(307);
    const location = new URL(response!.headers.get("location")!);
    expect(location.pathname).toBe("/api/dooor-auth/signin");
    expect(location.searchParams.get("redirect_url")).toBe("/dashboard");
  });

  it("rejects a forged session cookie", async () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/"], cookieSecret });
    const response = await middleware(request("/dashboard", "dooor_session=not-actually-a-valid-token"));
    expect(response?.status).toBe(307);
  });

  it("lets a cryptographically valid session cookie through", async () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/"], cookieSecret });
    const encrypted = await encryptCookiePayload(cookieSecret, {
      accessToken: "signed-access-token",
      refreshToken: "opaque-refresh-token",
      expiresAt: Date.now() + 300_000,
    });
    const response = await middleware(request("/dashboard", `dooor_session=${encrypted}`));
    expect(response).toBeUndefined();
  });

  it("respects a custom cookie name and sign-in path", async () => {
    const middleware = dooorAuthMiddleware({ cookieName: "custom_session", cookieSecret, signInPath: "/login" });
    const denied = await middleware(request("/dashboard"));
    expect(new URL(denied!.headers.get("location")!).pathname).toBe("/login");

    const encrypted = await encryptCookiePayload(cookieSecret, {
      accessToken: "signed-access-token",
      expiresAt: Date.now() + 300_000,
    });
    const allowed = await middleware(request("/dashboard", `custom_session=${encrypted}`));
    expect(allowed).toBeUndefined();
  });

  it("fails closed when the cookie secret is unavailable", async () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/"], cookieSecret: "" });
    const response = await middleware(request("/dashboard", "dooor_session=anything"));
    expect(response?.status).toBe(307);
  });
  it("guards a custom basePath without looping on its own auth routes", async () => {
    const middleware = dooorAuthMiddleware({ basePath: "/api/auth" });

    // The BFF's own routes must stay reachable...
    await expect(middleware(request("/api/auth/signin"))).resolves.toBeUndefined();

    // ...and the default path is no longer special-cased.
    const response = await middleware(request("/api/dooor-auth/session"));
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/api/auth/signin");
  });

  it("clears an unusable session cookie while redirecting to sign-in", async () => {
    const middleware = dooorAuthMiddleware({ cookieSecret });
    const response = await middleware(request("/reports", "dooor_session=forged"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("dooorAuthMiddleware session renewal", () => {
  const expiredSession = async () =>
    encryptCookiePayload(cookieSecret, {
      accessToken: "at_expired",
      refreshToken: "dor_rt_current",
      expiresAt: Date.now() - 1_000,
      user: { id: "usr_1", email: "ada@example.com" },
    });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redeems the refresh token and rewrites the cookie in place", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ access_token: "at_new", refresh_token: "dor_rt_next", token_type: "Bearer", expires_in: 300 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const middleware = dooorAuthMiddleware({ cookieSecret, publishableKey: "dor_pk_test", issuer: "https://auth.example.test" });
    const response = await middleware(request("/reports", `dooor_session=${await expiredSession()}`));

    // Not a redirect: the request continues, carrying the refreshed cookie.
    expect(response?.status).toBe(200);
    const setCookie = response?.headers.get("set-cookie") ?? "";
    const raw = setCookie.split(";")[0]!.replace("dooor_session=", "");
    const renewed = await decryptCookiePayload<{ accessToken: string; refreshToken?: string; user?: { email: string } }>(cookieSecret, raw);

    expect(renewed?.accessToken).toBe("at_new");
    expect(renewed?.refreshToken).toBe("dor_rt_next");
    expect(renewed?.user?.email).toBe("ada@example.com"); // profile survives the rotation
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("grant_type=refresh_token");
  });

  it("signs the user out when the IdP refuses the refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const middleware = dooorAuthMiddleware({ cookieSecret, publishableKey: "dor_pk_test" });
    const response = await middleware(request("/reports", `dooor_session=${await expiredSession()}`));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("redirect_url=%2Freports");
  });

  it("never touches the network when renewal is disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const middleware = dooorAuthMiddleware({ cookieSecret, refreshTokens: false, publishableKey: "dor_pk_test" });
    // Falls through to the BFF, which owns refresh: the request is let past untouched.
    await expect(middleware(request("/reports", `dooor_session=${await expiredSession()}`))).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a still-fresh session alone", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const fresh = await encryptCookiePayload(cookieSecret, {
      accessToken: "at_fresh",
      refreshToken: "dor_rt_current",
      expiresAt: Date.now() + 5 * 60_000,
    });

    const middleware = dooorAuthMiddleware({ cookieSecret, publishableKey: "dor_pk_test" });
    await expect(middleware(request("/reports", `dooor_session=${fresh}`))).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
