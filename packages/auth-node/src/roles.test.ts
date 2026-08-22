import { describe, expect, it } from "vitest";
import { assertRoles, hasRoles } from "./roles.js";
import { DooorAuthError } from "@dooor-ai/auth-core";

describe("hasRoles", () => {
  it("matches any required role by default", () => {
    expect(hasRoles({ roles: ["editor"] }, ["admin", "editor"])).toBe(true);
  });

  it("requires every role when requireAll is set", () => {
    expect(hasRoles({ roles: ["editor"] }, ["admin", "editor"], { requireAll: true })).toBe(false);
    expect(hasRoles({ roles: ["editor", "admin"] }, ["admin", "editor"], { requireAll: true })).toBe(true);
  });

  it("treats an empty requirement as satisfied", () => {
    expect(hasRoles({ roles: [] }, [])).toBe(true);
    expect(hasRoles({}, [])).toBe(true);
  });

  it("fails closed when the token carries no roles claim", () => {
    expect(hasRoles({}, ["admin"])).toBe(false);
  });
});

describe("assertRoles", () => {
  it("passes silently when the role is granted", () => {
    expect(() => assertRoles({ roles: ["admin"] }, ["admin"])).not.toThrow();
  });

  it("throws a DooorAuthError with an insufficient_role code", () => {
    try {
      assertRoles({ roles: ["viewer"] }, ["admin"]);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DooorAuthError);
      expect((error as DooorAuthError).code).toBe("insufficient_role");
      expect((error as DooorAuthError).message).toContain("admin");
    }
  });
});
