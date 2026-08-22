import { createAuthGuard, type CreateAuthGuardOptions } from "./guard.js";
import { assertRoles } from "./roles.js";
import type { DooorTokenPayload } from "./types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    /**
     * Types `req.dooor` for downstream handlers. Declared here (rather than
     * pulled from `@types/express`) so the package stays dependency-free;
     * merging is a no-op when Express types are absent.
     */
    interface Request {
      dooor?: DooorTokenPayload;
    }
  }
}

/** Structural subset of Express's `Request` this middleware needs. No `express` dependency required. */
export interface DooorAuthRequest {
  headers: Record<string, string | string[] | undefined>;
  dooor?: DooorTokenPayload;
  [key: string]: unknown;
}

export interface DooorAuthResponseLike {
  status(code: number): { json(body: unknown): unknown };
  [key: string]: unknown;
}

export type NextLike = (err?: unknown) => void;

export interface RequireDooorAuthOptions extends CreateAuthGuardOptions {
  /** When true, missing/invalid tokens call `next()` without a body instead of 401ing. `req.dooor` stays undefined. */
  optional?: boolean;
  /** Roles the token must carry. Denied requests get a 403 (authenticated but not allowed), not a 401. */
  roles?: string[];
  /** Require every role in `roles` instead of any one of them. */
  requireAllRoles?: boolean;
}

/**
 * Express middleware that verifies the `Authorization: Bearer <token>`
 * header via `verifyDooorAccessToken` and attaches the decoded claims to
 * `req.dooor`. Issuer/audience default to `DOOOR_AUTH_ISSUER` /
 * `DOOOR_AUTH_APP_ID` from the environment (see PRD §6.6, injected
 * automatically by the platform at deploy time).
 *
 * ```ts
 * import { requireDooorAuth } from "@dooor-ai/auth-node/express";
 * app.use(requireDooorAuth());
 * app.get("/me", (req, res) => res.json(req.dooor));
 * ```
 */
export function requireDooorAuth(options: RequireDooorAuthOptions = {}) {
  const guard = createAuthGuard(options);

  return async function dooorAuthMiddleware(
    req: DooorAuthRequest,
    res: DooorAuthResponseLike,
    next: NextLike,
  ): Promise<void> {
    try {
      const claims = await guard(req);
      if (options.roles?.length) {
        assertRoles(claims, options.roles, { requireAll: options.requireAllRoles });
      }
      req.dooor = claims;
      next();
    } catch (error) {
      if (options.optional) {
        next();
        return;
      }
      // A valid token that lacks the role is authenticated but unauthorized.
      const isRoleFailure =
        typeof error === "object" && error !== null && (error as { code?: string }).code === "insufficient_role";
      res.status(isRoleFailure ? 403 : 401).json({
        error: isRoleFailure ? "forbidden" : "unauthorized",
        message: error instanceof Error ? error.message : "Unauthorized",
      });
    }
  };
}
