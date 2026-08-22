import { createAuthGuard, type CreateAuthGuardOptions } from "./guard.js";
import { assertRoles } from "./roles.js";
import type { DooorTokenPayload } from "./types.js";

/** Structural subset of Fastify's request. No `fastify` dependency required. */
export interface DooorFastifyRequest {
  headers: Record<string, string | string[] | undefined>;
  dooor?: DooorTokenPayload;
}

export interface DooorFastifyReply {
  code(statusCode: number): DooorFastifyReply;
  send(payload: unknown): unknown;
}

export interface DooorFastifyHookOptions extends CreateAuthGuardOptions {
  /** When true, an invalid or missing token leaves `request.dooor` undefined instead of replying 401. */
  optional?: boolean;
  /** Roles the token must carry. Denied requests get a 403. */
  roles?: string[];
  /** Require every role in `roles` instead of any one of them. */
  requireAllRoles?: boolean;
}

/**
 * Fastify `preHandler` hook that verifies the bearer access token offline and
 * attaches the claims to `request.dooor`.
 *
 * ```ts
 * import { dooorAuthHook } from "@dooor-ai/auth-node/fastify";
 *
 * app.addHook("preHandler", dooorAuthHook());
 * app.get("/me", (request) => request.dooor);
 * ```
 *
 * Scope it to a subtree by registering the hook inside a plugin instead of on
 * the root instance.
 */
export function dooorAuthHook(options: DooorFastifyHookOptions = {}) {
  const guard = createAuthGuard(options);

  return async function dooorAuthPreHandler(
    request: DooorFastifyRequest,
    reply: DooorFastifyReply,
  ): Promise<void> {
    try {
      const claims = await guard(request);
      if (options.roles?.length) {
        assertRoles(claims, options.roles, { requireAll: options.requireAllRoles });
      }
      request.dooor = claims;
    } catch (error) {
      if (options.optional) return;

      const isRoleFailure =
        typeof error === "object" && error !== null && (error as { code?: string }).code === "insufficient_role";
      // Returning the reply promise tells Fastify the request is already answered.
      await reply.code(isRoleFailure ? 403 : 401).send({
        error: isRoleFailure ? "forbidden" : "unauthorized",
        message: error instanceof Error ? error.message : "Unauthorized",
      });
    }
  };
}
