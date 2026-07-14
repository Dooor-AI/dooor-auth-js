import { describe, expect, it } from "vitest";
import { dooorAuthMiddleware } from "./middleware.js";

function request(pathname: string, cookie?: string): Request {
  return new Request(`https://my-app.example.com${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("dooorAuthMiddleware", () => {
  it("lets requests to the BFF routes through untouched", () => {
    const middleware = dooorAuthMiddleware();
    expect(middleware(request("/api/dooor-auth/session"))).toBeUndefined();
  });

  it("lets exact public routes through without a session cookie", () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/"] });
    expect(middleware(request("/"))).toBeUndefined();
  });

  it("matches wildcard public routes with the (.*) suffix", () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/sign-in(.*)"] });
    expect(middleware(request("/sign-in"))).toBeUndefined();
    expect(middleware(request("/sign-in/help"))).toBeUndefined();
  });

  it("redirects to the sign-in path when the session cookie is absent on a protected route", () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/"] });
    const response = middleware(request("/dashboard"));

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(307);
    const location = new URL(response!.headers.get("location")!);
    expect(location.pathname).toBe("/api/dooor-auth/signin");
    expect(location.searchParams.get("redirect_url")).toBe("/dashboard");
  });

  it("lets the request through when the session cookie is present, regardless of validity (documented limitation)", () => {
    const middleware = dooorAuthMiddleware({ publicRoutes: ["/"] });
    const response = middleware(request("/dashboard", "dooor_session=not-actually-a-valid-token"));
    expect(response).toBeUndefined();
  });

  it("respects a custom cookie name and sign-in path", () => {
    const middleware = dooorAuthMiddleware({ cookieName: "custom_session", signInPath: "/login" });
    const denied = middleware(request("/dashboard"));
    expect(new URL(denied!.headers.get("location")!).pathname).toBe("/login");

    const allowed = middleware(request("/dashboard", "custom_session=abc"));
    expect(allowed).toBeUndefined();
  });
});
