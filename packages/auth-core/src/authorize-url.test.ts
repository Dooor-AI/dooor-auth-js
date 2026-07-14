import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl } from "./authorize-url.js";

describe("buildAuthorizeUrl", () => {
  it("builds a well-formed authorize URL against the default issuer", () => {
    const url = new URL(
      buildAuthorizeUrl({
        publishableKey: "dor_pk_test",
        redirectUri: "https://my-app.example.com/api/dooor-auth/callback",
        state: "state123",
        codeChallenge: "challenge123",
      }),
    );

    expect(url.origin).toBe("https://auth.dooor.ai");
    expect(url.pathname).toBe("/v1/idp/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("dor_pk_test");
    expect(url.searchParams.get("redirect_uri")).toBe("https://my-app.example.com/api/dooor-auth/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("respects a custom issuer and merges extra params", () => {
    const url = new URL(
      buildAuthorizeUrl({
        issuer: "https://auth.staging.dooor.ai",
        publishableKey: "dor_pk_test",
        redirectUri: "http://localhost:3000/api/dooor-auth/callback",
        state: "state123",
        codeChallenge: "challenge123",
        extraParams: { prompt: "select_account" },
      }),
    );

    expect(url.origin).toBe("https://auth.staging.dooor.ai");
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });
});
