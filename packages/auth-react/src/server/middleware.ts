import { parseCookies } from "./http.js";
import { decryptCookiePayloadWeb } from "./cookie-crypto-web.js";
import type { SessionCookiePayload } from "./config.js";

export interface DooorAuthMiddlewareOptions {
  /** Routes that never require a session. Exact match, or `"/prefix(.*)"` to match a prefix (mirrors the Clerk convention from the PRD quickstart). */
  publicRoutes?: (string | RegExp)[];
  /** Name of the session cookie to check for. Must match `createDooorAuthHandler`'s `cookieName` (default `dooor_session`). */
  cookieName?: string;
  /** AES-256-GCM secret used by the BFF. Defaults to `DOOOR_AUTH_COOKIE_SECRET`. */
  cookieSecret?: string;
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
 * Next.js middleware guard. It validates the AES-GCM integrity and structural
 * shape of the first-party session cookie using Web Crypto, so forged,
 * corrupted, or plaintext lookalike cookies cannot unlock protected routes.
 * Central revocation and refresh remain the BFF/server authorization layer;
 * access tokens are intentionally short-lived to bound that window.
 */
export function dooorAuthMiddleware(options: DooorAuthMiddlewareOptions = {}) {
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
  const cookieSecret = options.cookieSecret ?? process.env.DOOOR_AUTH_COOKIE_SECRET;
  const signInPath = options.signInPath ?? "/api/dooor-auth/signin";
  const publicRoutes = options.publicRoutes ?? [];

  return async function middleware(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/dooor-auth")) return undefined;
    if (publicRoutes.some((pattern) => matchesPublicRoute(url.pathname, pattern))) return undefined;

    const cookies = parseCookies(request.headers.get("cookie"));
    const rawSession = cookies[cookieName];
    if (rawSession && cookieSecret) {
      const session = await decryptCookiePayloadWeb<SessionCookiePayload>(cookieSecret, rawSession);
      if (isStructurallyValidSession(session)) return undefined;
    }

    const redirectTarget = new URL(signInPath, url.origin);
    redirectTarget.searchParams.set("redirect_url", url.pathname + url.search);
    return Response.redirect(redirectTarget, 307);
  };
}

function isStructurallyValidSession(session: SessionCookiePayload | undefined): session is SessionCookiePayload {
  return Boolean(
    session &&
      typeof session.accessToken === "string" &&
      session.accessToken.length > 0 &&
      typeof session.expiresAt === "number" &&
      Number.isFinite(session.expiresAt) &&
      session.expiresAt > 0 &&
      (session.refreshToken === undefined || typeof session.refreshToken === "string"),
  );
}
