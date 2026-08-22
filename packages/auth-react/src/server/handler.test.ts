import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptCookiePayload, encryptCookiePayload } from "./cookie-crypto.js";
import { createDooorAuthHandler } from "./handler.js";
import type { SessionCookiePayload, TxnCookiePayload } from "./config.js";

const cookieSecret = "test-cookie-secret-with-at-least-thirty-two-characters";

function routeContext(route: string) {
  return { params: Promise.resolve({ route: [route] }) };
}

function cookieValue(setCookie: string, name: string): string {
  const pair = setCookie
    .split(/,\s*(?=[^;,]+=)/)
    .find((part) => part.trim().startsWith(`${name}=`));
  if (!pair) throw new Error(`Cookie ${name} not found`);
  return pair.trim().slice(name.length + 1).split(";")[0]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDooorAuthHandler", () => {
  it("rejects an external post-login redirect and stores a same-origin fallback", async () => {
    const { GET } = createDooorAuthHandler({
      issuer: "https://auth.example.test",
      publishableKey: "dor_pk_test",
      cookieSecret,
      defaultRedirectUrl: "/dashboard",
    });

    const response = await GET(
      new Request(
        "https://miniapp.example.test/api/dooor-auth/signin?redirect_url=https%3A%2F%2Fevil.example%2Fsteal",
      ),
      routeContext("signin"),
    );

    expect(response.status).toBe(307);
    const setCookie = response.headers.get("set-cookie") ?? "";
    const rawTxn = cookieValue(setCookie, "dooor_session_txn");
    const txn = await decryptCookiePayload<TxnCookiePayload>(cookieSecret, rawTxn);
    expect(txn?.redirectAfter).toBe("/dashboard");
  });

  it("keeps a valid same-origin redirect path", async () => {
    const { GET } = createDooorAuthHandler({
      issuer: "https://auth.example.test",
      publishableKey: "dor_pk_test",
      cookieSecret,
    });

    const response = await GET(
      new Request(
        "https://miniapp.example.test/api/dooor-auth/signin?redirect_url=%2Freports%3Ftab%3Dmonth",
      ),
      routeContext("signin"),
    );
    const rawTxn = cookieValue(
      response.headers.get("set-cookie") ?? "",
      "dooor_session_txn",
    );
    const txn = await decryptCookiePayload<TxnCookiePayload>(cookieSecret, rawTxn);
    expect(txn?.redirectAfter).toBe("/reports?tab=month");
  });

  it("revokes the IdP refresh token before clearing the local session", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session: SessionCookiePayload = {
      accessToken: "access-token",
      refreshToken: "dor_rt_refresh-token",
      expiresAt: Date.now() + 60_000,
    };
    const encrypted = await encryptCookiePayload(cookieSecret, session);
    const { POST } = createDooorAuthHandler({
      issuer: "https://auth.example.test",
      publishableKey: "dor_pk_test",
      cookieSecret,
    });

    const response = await POST(
      new Request("https://miniapp.example.test/api/dooor-auth/signout", {
        method: "POST",
        headers: { cookie: `dooor_session=${encrypted}` },
      }),
      routeContext("signout"),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://auth.example.test/v1/idp/revoke");
    expect(String(init?.body)).toContain("token=dor_rt_refresh-token");
    expect(String(init?.body)).toContain("client_id=dor_pk_test");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("returns 405 for a sign-out attempted with GET, so a cross-site image tag cannot end the session", async () => {
    const { GET } = createDooorAuthHandler({ publishableKey: "dor_pk_test", cookieSecret });

    const response = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/signout"),
      routeContext("signout"),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("serves the built-in error page instead of a bare 404 when sign-in fails", async () => {
    const { GET } = createDooorAuthHandler({ publishableKey: "dor_pk_test", cookieSecret });

    const response = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/error?reason=access_denied"),
      routeContext("error"),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain("access_denied");
  });

  it("strips markup from the error reason before reflecting it", async () => {
    const { GET } = createDooorAuthHandler({ publishableKey: "dor_pk_test", cookieSecret });

    const response = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/error?reason=%3Cscript%3Ealert(1)%3C/script%3E"),
      routeContext("error"),
    );

    const body = await response.text();
    expect(body).not.toContain("<script>");
    expect(body).toContain("scriptalertscript");
  });

  it("sends a failed callback to the error route under the configured basePath", async () => {
    const { GET } = createDooorAuthHandler({
      publishableKey: "dor_pk_test",
      cookieSecret,
      basePath: "/api/auth",
    });

    const response = await GET(
      new Request("https://miniapp.example.test/api/auth/callback?error=access_denied"),
      routeContext("callback"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://miniapp.example.test/api/auth/error?reason=access_denied",
    );
  });

  it("redirects to a custom errorUrl when the app provides one", async () => {
    const { GET } = createDooorAuthHandler({
      publishableKey: "dor_pk_test",
      cookieSecret,
      errorUrl: "/login-problem",
    });

    const response = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/callback?code=abc&state=mismatch"),
      routeContext("callback"),
    );

    expect(response.headers.get("location")).toBe(
      "https://miniapp.example.test/login-problem?reason=missing_transaction",
    );
  });

  it("requests offline_access so the IdP issues a refresh token", async () => {
    const { GET } = createDooorAuthHandler({
      issuer: "https://auth.example.test",
      publishableKey: "dor_pk_test",
      cookieSecret,
    });

    const response = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/signin"),
      routeContext("signin"),
    );

    const authorizeUrl = new URL(response.headers.get("location")!);
    expect(authorizeUrl.searchParams.get("scope")).toBe("openid profile email offline_access");
  });

  it("completes the full sign-in flow: authorize -> callback -> session -> refresh", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const body = String(init?.body ?? "");
      if (body.includes("grant_type=authorization_code")) {
        return new Response(
          JSON.stringify({
            access_token: "at_first",
            refresh_token: "dor_rt_first",
            token_type: "Bearer",
            expires_in: 300,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (body.includes("grant_type=refresh_token")) {
        expect(body).toContain("refresh_token=dor_rt_first");
        return new Response(
          JSON.stringify({
            access_token: "at_second",
            refresh_token: "dor_rt_second",
            token_type: "Bearer",
            expires_in: 300,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected request to ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = createDooorAuthHandler({
      issuer: "https://auth.example.test",
      publishableKey: "dor_pk_test",
      cookieSecret,
    });

    // 1. sign-in: stash PKCE + state in the txn cookie
    const signIn = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/signin?redirect_url=%2Fdashboard"),
      routeContext("signin"),
    );
    const rawTxn = cookieValue(signIn.headers.get("set-cookie") ?? "", "dooor_session_txn");
    const txn = (await decryptCookiePayload<TxnCookiePayload>(cookieSecret, rawTxn))!;
    const state = new URL(signIn.headers.get("location")!).searchParams.get("state");
    expect(state).toBe(txn.state);

    // 2. callback: exchange the code, land the session cookie
    const callback = await GET(
      new Request(
        `https://miniapp.example.test/api/dooor-auth/callback?code=auth_code&state=${txn.state}`,
        { headers: { cookie: `dooor_session_txn=${rawTxn}` } },
      ),
      routeContext("callback"),
    );
    expect(callback.headers.get("location")).toBe("https://miniapp.example.test/dashboard");

    const setCookie = callback.headers.get("set-cookie") ?? "";
    const rawSession = cookieValue(setCookie, "dooor_session");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("dooor_session_txn=;"); // txn cookie cleared right after use
    const stored = (await decryptCookiePayload<SessionCookiePayload>(cookieSecret, rawSession))!;
    expect(stored.accessToken).toBe("at_first");
    expect(stored.refreshToken).toBe("dor_rt_first");

    // 3. session: served straight from the cookie while fresh
    const session = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/session", {
        headers: { cookie: `dooor_session=${rawSession}` },
      }),
      routeContext("session"),
    );
    await expect(session.json()).resolves.toMatchObject({ isSignedIn: true, accessToken: "at_first" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no network call for a fresh token

    // 4. session with an expired token: refreshed and re-stored, rotation included
    const expired = await encryptCookiePayload(cookieSecret, { ...stored, expiresAt: Date.now() - 1_000 });
    const refreshed = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/session", {
        headers: { cookie: `dooor_session=${expired}` },
      }),
      routeContext("session"),
    );
    await expect(refreshed.json()).resolves.toMatchObject({ isSignedIn: true, accessToken: "at_second" });

    const rotated = (await decryptCookiePayload<SessionCookiePayload>(
      cookieSecret,
      cookieValue(refreshed.headers.get("set-cookie") ?? "", "dooor_session"),
    ))!;
    expect(rotated.refreshToken).toBe("dor_rt_second");
  });

  it("drops the session when the IdP refuses to refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ error: "invalid_grant", error_description: "principal blocked" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const expired = await encryptCookiePayload(cookieSecret, {
      accessToken: "at_old",
      refreshToken: "dor_rt_old",
      expiresAt: Date.now() - 1_000,
    } satisfies SessionCookiePayload);

    const { GET } = createDooorAuthHandler({
      issuer: "https://auth.example.test",
      publishableKey: "dor_pk_test",
      cookieSecret,
    });

    const response = await GET(
      new Request("https://miniapp.example.test/api/dooor-auth/session", {
        headers: { cookie: `dooor_session=${expired}` },
      }),
      routeContext("session"),
    );

    await expect(response.json()).resolves.toMatchObject({ isSignedIn: false, accessToken: null });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
