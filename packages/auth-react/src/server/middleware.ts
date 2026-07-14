import { parseCookies } from "./http.js";

export interface DooorAuthMiddlewareOptions {
  /** Routes that never require a session. Exact match, or `"/prefix(.*)"` to match a prefix (mirrors the Clerk convention from the PRD quickstart). */
  publicRoutes?: (string | RegExp)[];
  /** Name of the session cookie to check for. Must match `createDooorAuthHandler`'s `cookieName` (default `dooor_session`). */
  cookieName?: string;
  /** Where unauthenticated requests get redirected. Defaults to `/api/dooor-auth/signin`. */
  signInPath?: string;
}

const DEFAULT_COOKIE_NAME = "dooor_session";

function matchesPublicRoute(pathname: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) return pattern.test(pathname);
  if (pattern.endsWith("(.*)")) {
    const prefix = pattern.slice(0, -4);
    return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`) || pathname.startsWith(prefix);
  }
  return pathname === pattern;
}

/**
 * Next.js middleware **stub**. IMPORTANT LIMITATIONS, by design for v1:
 *
 * 1. It only checks whether the `dooor_session` cookie is **present**, not
 *    whether it is still valid. An expired, revoked, or corrupted cookie
 *    passes this check; real validation (decrypt + refresh-if-needed)
 *    happens in the BFF `/api/dooor-auth/session` route handler, which
 *    `useAuth()`/`useUser()` call on every mount.
 * 2. Middleware conventionally runs on the Edge runtime, where Node's
 *    `crypto` module (used by the cookie encryption in `handler.ts`) is not
 *    guaranteed to be available, so no decryption is attempted here.
 * 3. Treat this purely as a coarse "is there any session at all" redirect
 *    guard for UX (avoid flashing a protected page before bouncing to
 *    sign-in), never as the source of truth for authorization. Always
 *    re-verify server-side (`verifyDooorToken` in your API routes, or
 *    `useAuth().getToken()` + a real backend check) before returning data.
 */
export function dooorAuthMiddleware(options: DooorAuthMiddlewareOptions = {}) {
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
  const signInPath = options.signInPath ?? "/api/dooor-auth/signin";
  const publicRoutes = options.publicRoutes ?? [];

  return function middleware(request: Request): Response | undefined {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/dooor-auth")) return undefined;
    if (publicRoutes.some((pattern) => matchesPublicRoute(url.pathname, pattern))) return undefined;

    const cookies = parseCookies(request.headers.get("cookie"));
    if (cookies[cookieName]) return undefined;

    const redirectTarget = new URL(signInPath, url.origin);
    redirectTarget.searchParams.set("redirect_url", url.pathname + url.search);
    return Response.redirect(redirectTarget, 307);
  };
}
