import { buildAuthorizeUrl, createPkcePair, exchangeCode, generateState, parseCallback, refreshToken, revokeToken, type DooorUser } from "@dooor-ai/auth-core";
import { verifyDooorAccessToken } from "@dooor-ai/auth-node";
import { resolveConfig, type CreateDooorAuthHandlerOptions, type ResolvedDooorAuthConfig, type SessionCookiePayload, type TxnCookiePayload } from "./config.js";
import { decryptCookiePayload, encryptCookiePayload } from "./cookie-crypto.js";
import { clearCookie, jsonResponse, parseCookies, serializeCookie } from "./http.js";

const TXN_COOKIE_MAX_AGE = 10 * 60; // 10 minutes: enough for a login flow, short enough to limit CSRF/replay window.
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days ceiling; the IdP's own cascade governs real session validity.
const REFRESH_SKEW_MS = 15_000;

/** Allowed HTTP methods per BFF route. Anything else gets a 405. */
const ROUTE_METHODS: Record<string, string[]> = {
  signin: ["GET"],
  callback: ["GET"],
  session: ["GET"],
  signout: ["POST"],
  error: ["GET"],
};

/**
 * Second argument Next.js passes to a route handler. Typed as `any` on
 * purpose: Next 14 passes `{ params: { route } }` while Next 15+ passes
 * `{ params: Promise<{ route }> }`, and Next's build-time route validator
 * rejects a handler whose context type does not match its own exactly. The
 * implementation awaits `params`, which handles both shapes at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteHandlerContext = any;

export type RouteHandler = (request: Request, context: RouteHandlerContext) => Promise<Response>;

async function decodeUserFromAccessToken(config: ResolvedDooorAuthConfig, accessToken: string): Promise<DooorUser | undefined> {
  if (!config.appId) return undefined;
  try {
    const claims = await verifyDooorAccessToken(accessToken, { issuer: config.issuer, audience: config.appId });
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
  const redirectAfter = resolveSameOriginRedirect(
    url.searchParams.get("redirect_url"),
    url,
    config.defaultRedirectUrl,
  );

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
    serializeCookie(config.txnCookieName, await encryptCookiePayload(config.cookieSecret, txn), {
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
    ? await decryptCookiePayload<TxnCookiePayload>(config.cookieSecret, cookies[config.txnCookieName]!)
    : undefined;

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(config.txnCookieName));

  if (parsed.error || !parsed.code || !txn || parsed.state !== txn.state) {
    const reason = parsed.error ?? (!txn ? "missing_transaction" : parsed.state !== txn.state ? "state_mismatch" : "invalid_callback");
    const errorUrl = new URL(config.errorUrl ?? `${config.basePath}/error`, url.origin);
    errorUrl.searchParams.set("reason", reason);
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
    serializeCookie(config.cookieName, await encryptCookiePayload(config.cookieSecret, session), {
      maxAge: SESSION_COOKIE_MAX_AGE,
    }),
  );
  headers.set(
    "Location",
    new URL(
      resolveSameOriginRedirect(txn.redirectAfter, url, config.defaultRedirectUrl),
      url.origin,
    ).toString(),
  );
  return new Response(null, { status: 302, headers });
}

async function handleSession(request: Request, config: ResolvedDooorAuthConfig): Promise<Response> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies[config.cookieName];
  const session = raw ? await decryptCookiePayload<SessionCookiePayload>(config.cookieSecret, raw) : undefined;

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
      serializeCookie(config.cookieName, await encryptCookiePayload(config.cookieSecret, next), {
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

async function handleSignOut(request: Request, config: ResolvedDooorAuthConfig): Promise<Response> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies[config.cookieName];
  const session = raw ? await decryptCookiePayload<SessionCookiePayload>(config.cookieSecret, raw) : undefined;
  if (session?.refreshToken) {
    try {
      await revokeToken({
        issuer: config.issuer,
        publishableKey: config.publishableKey,
        token: session.refreshToken,
      });
    } catch {
      // Local logout must remain available during an IdP outage. The short
      // access-token TTL bounds the remaining server-side session window.
    }
  }
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(config.cookieName));
  return jsonResponse({ signedOut: true }, headers);
}

/**
 * Renders the fallback sign-in error page. Apps that want their own UI set
 * `errorUrl` (or `DOOOR_AUTH_ERROR_URL`) and get redirected there with the
 * same `?reason=` query param instead.
 */
function handleError(request: Request): Response {
  const url = new URL(request.url);
  const reason = sanitizeReason(url.searchParams.get("reason"));
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign-in failed</title>
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5">
    <h1 style="font-size: 1.25rem; margin-bottom: 0.5rem">Sign-in could not be completed</h1>
    <p style="color: #555">Reason: <code>${reason}</code></p>
    <p><a href="/">Back to the app</a></p>
  </body>
</html>`;
  return new Response(body, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/** OAuth error codes are `[a-z_]` per RFC 6749 §4.1.2.1; anything else is dropped so the reason can never be reflected as HTML. */
function sanitizeReason(raw: string | null): string {
  if (!raw) return "unknown_error";
  const cleaned = raw.replace(/[^a-z_]/gi, "").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "unknown_error";
}

function resolveSameOriginRedirect(
  candidate: string | null | undefined,
  requestUrl: URL,
  fallback: string,
): string {
  for (const value of [candidate, fallback, "/"]) {
    if (!value) continue;
    try {
      const resolved = new URL(value, requestUrl.origin);
      if (resolved.origin !== requestUrl.origin) continue;
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
      continue;
    }
  }
  return "/";
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
    const params = (await context.params) as { route?: string[] } | undefined;
    const route = params?.route?.[0];

    const allowedMethods = route ? ROUTE_METHODS[route] : undefined;
    if (!allowedMethods) return new Response("Not found", { status: 404 });
    if (!allowedMethods.includes(request.method)) {
      // Notably: sign-out is POST-only, so a cross-site `<img src=".../signout">` cannot end the session.
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: allowedMethods.join(", ") },
      });
    }

    switch (route) {
      case "signin":
        return handleSignIn(request, config);
      case "callback":
        return handleCallback(request, config);
      case "session":
        return handleSession(request, config);
      case "signout":
        return handleSignOut(request, config);
      case "error":
        return handleError(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  };

  return { GET: handler, POST: handler };
}
