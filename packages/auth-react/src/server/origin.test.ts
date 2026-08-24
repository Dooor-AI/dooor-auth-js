import { describe, it, expect } from "vitest";
import { resolvePublicOrigin, resolveRequestUrl } from "./origin.js";

/**
 * Regression: an app deployed behind a reverse proxy sent the IdP a
 * `redirect_uri` of `https://localhost:3000/api/dooor-auth/callback` and got a
 * 400 back. The container's own origin is not the origin the browser used.
 */
function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("resolvePublicOrigin", () => {
  it("prefers the configured appUrl over everything else", () => {
    const request = req("http://localhost:3000/api/dooor-auth/signin", {
      "x-forwarded-host": "attacker.example",
      host: "also-wrong.example",
    });
    expect(resolvePublicOrigin(request, "https://myapp.apps.dooor.ai")).toBe(
      "https://myapp.apps.dooor.ai",
    );
  });

  it("keeps only the origin of appUrl, dropping any path", () => {
    const request = req("http://localhost:3000/x");
    expect(resolvePublicOrigin(request, "https://myapp.example.com/some/path?q=1")).toBe(
      "https://myapp.example.com",
    );
  });

  it("falls back to appUrl being unparseable by ignoring it", () => {
    const request = req("http://app.example.com/x", { host: "app.example.com" });
    expect(resolvePublicOrigin(request, "not a url")).toBe("http://app.example.com");
  });

  it("uses the forwarded headers written by the proxy", () => {
    const request = req("http://localhost:3000/api/dooor-auth/signin", {
      "x-forwarded-host": "myapp.apps.dooor.ai",
      "x-forwarded-proto": "https",
    });
    expect(resolvePublicOrigin(request)).toBe("https://myapp.apps.dooor.ai");
  });

  it("takes the client-most value of a forwarded header chain", () => {
    const request = req("http://localhost:3000/x", {
      "x-forwarded-host": "myapp.apps.dooor.ai, inner-proxy.internal",
      "x-forwarded-proto": "https, http",
    });
    expect(resolvePublicOrigin(request)).toBe("https://myapp.apps.dooor.ai");
  });

  it("assumes https when the proxy forwards a host but no protocol", () => {
    const request = req("http://localhost:3000/x", { "x-forwarded-host": "myapp.apps.dooor.ai" });
    expect(resolvePublicOrigin(request)).toBe("http://myapp.apps.dooor.ai");
  });

  it("uses the Host header when there is no forwarded host", () => {
    const request = req("http://localhost:3000/x", { host: "myapp.apps.dooor.ai" });
    expect(resolvePublicOrigin(request)).toBe("http://myapp.apps.dooor.ai");
  });

  it("ignores a loopback Host, which is the container talking to itself", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "0.0.0.0:3000"]) {
      const request = req("http://localhost:3000/x", { host });
      expect(resolvePublicOrigin(request)).toBe("http://localhost:3000");
    }
  });

  it("leaves a plain local dev request untouched", () => {
    const request = req("http://localhost:3000/api/dooor-auth/signin", {
      host: "localhost:3000",
    });
    expect(resolvePublicOrigin(request)).toBe("http://localhost:3000");
  });
});

describe("resolveRequestUrl", () => {
  it("rebases path, query and hash onto the public origin", () => {
    const request = req("http://localhost:3000/api/dooor-auth/callback?code=abc&state=xyz", {
      "x-forwarded-host": "myapp.apps.dooor.ai",
      "x-forwarded-proto": "https",
    });
    const url = resolveRequestUrl(request);
    expect(url.origin).toBe("https://myapp.apps.dooor.ai");
    expect(url.pathname).toBe("/api/dooor-auth/callback");
    expect(url.searchParams.get("code")).toBe("abc");
    expect(url.searchParams.get("state")).toBe("xyz");
  });

  it("produces the callback URI the IdP allowlist actually contains", () => {
    const request = req("http://localhost:3000/api/dooor-auth/signin", {
      "x-forwarded-host": "myapp.apps.dooor.ai",
      "x-forwarded-proto": "https",
    });
    const url = resolveRequestUrl(request);
    expect(new URL("/api/dooor-auth/callback", url.origin).toString()).toBe(
      "https://myapp.apps.dooor.ai/api/dooor-auth/callback",
    );
  });
});
