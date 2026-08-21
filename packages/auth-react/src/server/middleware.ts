import { refreshToken as redeemRefreshToken } from "@dooor-ai/auth-core";
import { parseCookies, serializeCookie } from "./http.js";
import { decryptCookiePayload, encryptCookiePayload } from "./cookie-crypto.js";
import type { SessionCookiePayload } from "./config.js";

export interface DooorAuthMiddlewareOptions {
  /** Routes that never require a session. Exact match, or `"/prefix(.*)"` to match a prefix (mirrors the Clerk convention from the PRD quickstart). */
  publicRoutes?: (string | RegExp)[];
  /** Name of the session cookie to check for. Must match `createDooorAuthHandler`'s `cookieName` (default `dooor_session`). */
  cookieName?: string;
  /** AES-256-GCM secret used by the BFF. Defaults to `DOOOR_AUTH_COOKIE_SECRET`. */
  cookieSecret?: string;
  /** Base path the BFF route handlers are mounted at. Must match `createDooorAuthHandler`'s `basePath` (default `/api/dooor-auth`), otherwise the middleware guards the auth routes themselves and the sign-in redirect loops. */
  basePath?: string;
  /** Where unauthenticated requests get redirected. Defaults to `${basePath}/signin`. */
  signInPath?: string;
  /**
   * Renew an expired session cookie in place instead of bouncing the user to
   * sign-in. Requires `next/server` (for the pass-through response that
   * carries the new `Set-Cookie`) and the publishable key. Default `true`.
   */
  refreshTokens?: boolean;
  /** OAuth `client_id` used to redeem the refresh token. Defaults to `DOOOR_AUTH_PUBLISHABLE_KEY`, then `NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY`. */
  publishableKey?: string;
  /** Dooor Auth issuer. Defaults to `DOOOR_AUTH_ISSUER`, then the SDK default. */
  issuer?: string;
}

const DEFAULT_COOKIE_NAME = "dooor_session";
const DEFAULT_BASE_PATH = "/api/dooor-auth";
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
/** Renew slightly before the real expiry so an in-flight request never lands on a just-expired token. */
const REFRESH_SKEW_MS = 15_000;

function matchesPublicRoute(pathname: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) return pattern.test(pathname);
  if (pattern.endsWith("(.*)")) {
    const prefix = pattern.slice(0, -4);
    return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`) || pathname.startsWith(prefix);
  }
  return pathname === pattern;
}

/**
 * Builds the pass-through response the request continues on, so the renewed
 * session cookie can ride along. Returns `undefined` outside Next.js, which
 * is the signal to skip renewal entirely - redeeming a rotating refresh token
 * we cannot persist would invalidate the stored one and break the session.
 */
async function createPassThroughResponse(): Promise<Response | undefined> {
  try {
    const { NextResponse } = (await import("next/server")) as { NextResponse: { next(): Response } };
    return NextResponse.next();
  } catch {
    return undefined;
  }
}

/**
 * Next.js middleware guard. It validates the AES-GCM integrity and structural
 * shape of the first-party session cookie using Web Crypto, so forged,
 * corrupted, or plaintext lookalike cookies cannot unlock protected routes.
 * When the access token has expired it redeems the refresh token and rewrites
 * the cookie in place, so server components downstream always observe a fresh
 * token. A refusal from the IdP (blocked principal, banned app user, disabled
 * instance) drops the session and bounces the user to sign-in.
 */
export function dooorAuthMiddleware(options: DooorAuthMiddlewareOptions = {}) {
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
  const cookieSecret = options.cookieSecret ?? process.env.DOOOR_AUTH_COOKIE_SECRET;
  const basePath = options.basePath ?? DEFAULT_BASE_PATH;
  const signInPath = options.signInPath ?? `${basePath}/signin`;
  const publicRoutes = options.publicRoutes ?? [];
  const shouldRefresh = options.refreshTokens ?? true;

  return async function middleware(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);

    if (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)) return undefined;
    if (publicRoutes.some((pattern) => matchesPublicRoute(url.pathname, pattern))) return undefined;

    const cookies = parseCookies(request.headers.get("cookie"));
    const rawSession = cookies[cookieName];
    if (rawSession && cookieSecret) {
      const session = await decryptCookiePayload<SessionCookiePayload>(cookieSecret, rawSession);
      if (isStructurallyValidSession(session)) {
        if (session.expiresAt - REFRESH_SKEW_MS > Date.now()) return undefined;

        const renewal = shouldRefresh
          ? await renewSession(session, cookieName, cookieSecret, options)
          : ({ status: "unavailable" } as const);

        // "unavailable" means we never asked the IdP (no `next/server` to carry
        // the new cookie, no refresh token, renewal disabled). Fall through to
        // the BFF, which owns refresh and revocation, rather than signing the
        // user out on a capability gap.
        if (renewal.status === "renewed") return renewal.response;
        if (renewal.status === "unavailable") return undefined;
      }
    }

    return redirectToSignIn(url, signInPath, cookieName, Boolean(rawSession));
  };
}

type RenewalResult =
  | { status: "renewed"; response: Response }
  /** Renewal was never attempted; the caller should let the request through untouched. */
  | { status: "unavailable" }
  /** The IdP refused to renew: the session is over. */
  | { status: "denied" };

async function renewSession(
  session: SessionCookiePayload,
  cookieName: string,
  cookieSecret: string,
  options: DooorAuthMiddlewareOptions,
): Promise<RenewalResult> {
  if (!session.refreshToken) return { status: "unavailable" };

  const publishableKey =
    options.publishableKey ??
    process.env.DOOOR_AUTH_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY;
  if (!publishableKey) return { status: "unavailable" };

  // Built before the network call: without somewhere to store the rotated
  // refresh token, redeeming it would burn the one in the cookie.
  const passThrough = await createPassThroughResponse();
  if (!passThrough) return { status: "unavailable" };

  try {
    const tokens = await redeemRefreshToken({
      issuer: options.issuer ?? process.env.DOOOR_AUTH_ISSUER,
      publishableKey,
      refreshToken: session.refreshToken,
    });

    const next: SessionCookiePayload = {
      refreshToken: tokens.refreshToken ?? session.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      user: session.user,
    };

    passThrough.headers.append(
      "Set-Cookie",
      serializeCookie(cookieName, await encryptCookiePayload(cookieSecret, next), {
        maxAge: SESSION_COOKIE_MAX_AGE,
      }),
    );
    return { status: "renewed", response: passThrough };
  } catch {
    // The IdP re-ran its access cascade and refused. Treat as signed out.
    return { status: "denied" };
  }
}

function redirectToSignIn(url: URL, signInPath: string, cookieName: string, hadCookie: boolean): Response {
  const redirectTarget = new URL(signInPath, url.origin);
  redirectTarget.searchParams.set("redirect_url", url.pathname + url.search);

  const headers = new Headers({ Location: redirectTarget.toString() });
  // Clear a cookie that is present but unusable, so the browser stops replaying it.
  if (hadCookie) headers.append("Set-Cookie", serializeCookie(cookieName, "", { maxAge: 0 }));
  return new Response(null, { status: 307, headers });
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
