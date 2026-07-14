import { describe, expect, it } from "vitest";
import { parseCallback } from "./callback.js";

describe("parseCallback", () => {
  it("parses code and state from a full URL", () => {
    const result = parseCallback("https://my-app.example.com/api/dooor-auth/callback?code=abc&state=xyz");
    expect(result).toEqual({ code: "abc", state: "xyz" });
  });

  it("parses an OAuth error response", () => {
    const result = parseCallback("?error=access_denied&error_description=User+cancelled");
    expect(result.error).toBe("access_denied");
    expect(result.errorDescription).toBe("User cancelled");
  });

  it("accepts a plain object of search params (Next.js searchParams)", () => {
    const result = parseCallback({ code: "abc", state: "xyz" });
    expect(result).toEqual({ code: "abc", state: "xyz" });
  });

  it("returns an empty object when there is nothing to parse", () => {
    expect(parseCallback("")).toEqual({});
  });
});
