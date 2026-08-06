import { describe, expect, it } from "vitest";
import { dooorAuthMiddleware } from "./middleware.js";
import { encryptCookiePayload } from "./cookie-crypto.js";

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
    const encrypted = encryptCookiePayload(cookieSecret, {
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

    const encrypted = encryptCookiePayload(cookieSecret, {
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
});
