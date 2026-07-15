import { createAuthGuard, type CreateAuthGuardOptions } from "./guard.js";
import type { DooorTokenPayload } from "./types.js";

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
      req.dooor = await guard(req);
      next();
    } catch (error) {
      if (options.optional) {
        next();
        return;
      }
      res.status(401).json({
        error: "unauthorized",
        message: error instanceof Error ? error.message : "Unauthorized",
      });
    }
  };
}
