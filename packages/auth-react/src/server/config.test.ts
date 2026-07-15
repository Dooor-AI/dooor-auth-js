import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  it("rejects cookie secrets shorter than 32 characters", () => {
    expect(() =>
      resolveConfig({
        publishableKey: "dor_pk_test",
        cookieSecret: "too-short",
      }),
    ).toThrow(/at least 32 characters/);
  });
});
