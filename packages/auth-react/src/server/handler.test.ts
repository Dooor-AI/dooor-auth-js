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
    const txn = decryptCookiePayload<TxnCookiePayload>(cookieSecret, rawTxn);
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
    const txn = decryptCookiePayload<TxnCookiePayload>(cookieSecret, rawTxn);
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
    const encrypted = encryptCookiePayload(cookieSecret, session);
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
});
