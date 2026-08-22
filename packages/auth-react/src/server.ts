export { createDooorAuthHandler, type RouteHandler, type RouteHandlerContext } from "./server/handler.js";
export { dooorAuthMiddleware, type DooorAuthMiddlewareOptions } from "./server/middleware.js";
export {
  auth,
  currentUser,
  getToken,
  requireAuth,
  type DooorServerSession,
  type ReadSessionOptions,
} from "./server/session.js";
export type { CreateDooorAuthHandlerOptions, ResolvedDooorAuthConfig, SessionCookiePayload, TxnCookiePayload } from "./server/config.js";
export type { DooorUser } from "@dooor-ai/auth-core";
