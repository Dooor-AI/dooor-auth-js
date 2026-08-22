import { DooorAuthError } from "@dooor-ai/auth-core";
import type { DooorTokenPayload } from "./types.js";

export interface RoleCheckOptions {
  /** Require every listed role instead of any one of them. Default `false` (any). */
  requireAll?: boolean;
}

/** True when the token carries the required roles. An empty requirement matches any authenticated principal. */
export function hasRoles(
  claims: Pick<DooorTokenPayload, "roles">,
  required: string[],
  options: RoleCheckOptions = {},
): boolean {
  if (required.length === 0) return true;
  const granted = new Set(claims.roles ?? []);
  return options.requireAll
    ? required.every((role) => granted.has(role))
    : required.some((role) => granted.has(role));
}

/**
 * Asserts the token carries the required roles, throwing `DooorAuthError`
 * (`code: "insufficient_role"`) otherwise. Roles are resolved per app at token
 * issuance, so this is an authorization check on already-verified claims -
 * never a substitute for verifying the token itself.
 *
 * ```ts
 * const claims = await verifyDooorAccessToken(token);
 * assertRoles(claims, ["admin"]);
 * ```
 */
export function assertRoles(
  claims: Pick<DooorTokenPayload, "roles">,
  required: string[],
  options: RoleCheckOptions = {},
): void {
  if (hasRoles(claims, required, options)) return;
  throw new DooorAuthError(
    `Requires ${options.requireAll ? "all" : "any"} of the roles: ${required.join(", ")}`,
    "insufficient_role",
  );
}
