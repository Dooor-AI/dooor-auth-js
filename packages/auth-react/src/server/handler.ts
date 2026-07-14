import { buildAuthorizeUrl, createPkcePair, exchangeCode, generateState, parseCallback, refreshToken, type DooorUser } from "@dooor-ai/auth-core";
import { verifyDooorToken } from "@dooor-ai/auth-node";
import { resolveConfig, type CreateDooorAuthHandlerOptions, type ResolvedDooorAuthConfig, type SessionCookiePayload, type TxnCookiePayload } from "./config.js";
import { decryptCookiePayload, encryptCookiePayload } from "./cookie-crypto.js";
import { clearCookie, jsonResponse, parseCookies, serializeCookie } from "./http.js";

const TXN_COOKIE_MAX_AGE = 10 * 60; // 10 minutes: enough for a login flow, short enough to limit CSRF/replay window.
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days ceiling; the IdP's own cascade governs real session validity.
const REFRESH_SKEW_MS = 15_000;

export type RouteHandler = (request: Request, context: { params: Promise<{ route?: string[] }> | { route?: string[] } }) => Promise<Response>;

async function decodeUserFromAccessToken(config: ResolvedDooorAuthConfig, accessToken: string): Promise<DooorUser | undefined> {
  if (!config.appId) return undefined;
  try {
    const claims = await verifyDooorToken(accessToken, { issuer: config.issuer, audience: config.appId });
    return {
      id: claims.sub,
      email: claims.email ?? "",
      name: typeof claims.name === "string" ? claims.name : undefined,
      image: typeof claims.picture === "string" ? claims.picture : undefined,
      roles: claims.roles,
      orgId: claims.org,
      realm: claims.realm,
    };
  } catch {
    return undefined;
  }
}

async function handleSignIn(request: Request, config: ResolvedDooorAuthConfig): Promise<Response> {
  const url = new URL(request.url);
  const redirectAfter = url.searchParams.get("redirect_url") ?? config.defaultRedirectUrl;

  const pkce = await createPkcePair();
  const state = generateState();
  const redirectUri = new URL(`${config.basePath}/callback`, url.origin).toString();

  const authorizeUrl = buildAuthorizeUrl({
    issuer: config.issuer,
    publishableKey: config.publishableKey,
    redirectUri,
    state,
    codeChallenge: pkce.codeChallenge,
    scope: config.scope,
  });

  const txn: TxnCookiePayload = { codeVerifier: pkce.codeVerifier, state, redirectAfter };
  const headers = new Headers({ Location: authorizeUrl });
  headers.append(
    "Set-Cookie",
    serializeCookie(config.txnCookieName, encryptCookiePayload(config.cookieSecret, txn), {
      maxAge: TXN_COOKIE_MAX_AGE,
      sameSite: "lax",
    }),
  );
  return new Response(null, { status: 307, headers });
}

async function handleCallback(request: Request, config: ResolvedDooorAuthConfig): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parseCallback(url);
  const cookies = parseCookies(request.headers.get("cookie"));
  const txn = cookies[config.txnCookieName]
    ? decryptCookiePayload<TxnCookiePayload>(config.cookieSecret, cookies[config.txnCookieName]!)
    : undefined;

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(config.txnCookieName));

  if (parsed.error || !parsed.code || !txn || parsed.state !== txn.state) {
    const errorUrl = new URL("/api/dooor-auth/error", url.origin);
    errorUrl.searchParams.set("reason", parsed.error ?? "invalid_callback");
    headers.set("Location", errorUrl.toString());
    return new Response(null, { status: 302, headers });
  }

  const redirectUri = new URL(`${config.basePath}/callback`, url.origin).toString();
  const tokens = await exchangeCode({
    issuer: config.issuer,
    publishableKey: config.publishableKey,
    redirectUri,
    code: parsed.code,
    codeVerifier: txn.codeVerifier,
  });

  const user = await decodeUserFromAccessToken(config, tokens.accessToken);
  const session: SessionCookiePayload = {
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
    user,
  };

  headers.append(
    "Set-Cookie",
    serializeCookie(config.cookieName, encryptCookiePayload(config.cookieSecret, session), {
      maxAge: SESSION_COOKIE_MAX_AGE,
    }),
  );
  headers.set("Location", new URL(txn.redirectAfter || config.defaultRedirectUrl, url.origin).toString());
  return new Response(null, { status: 302, headers });
}

async function handleSession(request: Request, config: ResolvedDooorAuthConfig): Promise<Response> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies[config.cookieName];
  const session = raw ? decryptCookiePayload<SessionCookiePayload>(config.cookieSecret, raw) : undefined;

  if (!session) {
    return jsonResponse({ isSignedIn: false, user: null, accessToken: null, expiresAt: null });
  }

  const isFresh = session.expiresAt - REFRESH_SKEW_MS > Date.now();
  if (isFresh) {
    return jsonResponse({ isSignedIn: true, user: session.user ?? null, accessToken: session.accessToken, expiresAt: session.expiresAt });
  }

  if (!session.refreshToken) {
    const headers = new Headers();
    headers.append("Set-Cookie", clearCookie(config.cookieName));
    return jsonResponse({ isSignedIn: false, user: null, accessToken: null, expiresAt: null }, headers);
  }

  try {
    const refreshed = await refreshToken({
      issuer: config.issuer,
      publishableKey: config.publishableKey,
      refreshToken: session.refreshToken,
    });
    const user = (await decodeUserFromAccessToken(config, refreshed.accessToken)) ?? session.user;
    const next: SessionCookiePayload = {
      refreshToken: refreshed.refreshToken ?? session.refreshToken,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      user,
    };

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      serializeCookie(config.cookieName, encryptCookiePayload(config.cookieSecret, next), {
        maxAge: SESSION_COOKIE_MAX_AGE,
      }),
    );
    return jsonResponse({ isSignedIn: true, user: next.user ?? null, accessToken: next.accessToken, expiresAt: next.expiresAt }, headers);
  } catch {
    // Refresh denied: the IdP re-ran the block/ban/disable cascade (PRD §5.2/§5.3) and said no. Drop the session.
    const headers = new Headers();
    headers.append("Set-Cookie", clearCookie(config.cookieName));
    return jsonResponse({ isSignedIn: false, user: null, accessToken: null, expiresAt: null }, headers);
  }
}

async function handleSignOut(_request: Request, config: ResolvedDooorAuthConfig): Promise<Response> {
  // Note: this clears the local BFF session only. It does not yet call `POST /v1/idp/revoke`
  // on the IdP, so the underlying refresh token is not server-side invalidated until it expires
  // or a principal/app-user block cascades into it. Documented limitation for v1.
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(config.cookieName));
  return jsonResponse({ signedOut: true }, headers);
}

/**
 * Builds the `{ GET, POST }` route handlers for
 * `app/api/dooor-auth/[...route]/route.ts`. Handles the full BFF flow:
 * sign-in redirect, OAuth callback (code exchange), session read/refresh,
 * and sign-out. See PRD §6.3 for why this runs server-side instead of a
 * cross-site cookie.
 */
export function createDooorAuthHandler(options: CreateDooorAuthHandlerOptions = {}): { GET: RouteHandler; POST: RouteHandler } {
  const handler: RouteHandler = async (request, context) => {
    const config = resolveConfig(options);
    const params = await context.params;
    const route = params.route?.[0];

    switch (route) {
      case "signin":
        return handleSignIn(request, config);
      case "callback":
        return handleCallback(request, config);
      case "session":
        return handleSession(request, config);
      case "signout":
        return handleSignOut(request, config);
      default:
        return new Response("Not found", { status: 404 });
    }
  };

  return { GET: handler, POST: handler };
}
