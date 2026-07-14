import { DEFAULT_ISSUER, DooorAuthError } from "@dooor-ai/auth-core";

export interface CreateDooorAuthHandlerOptions {
  /** Dooor Auth issuer. Defaults to `DOOOR_AUTH_ISSUER`, then `https://auth.dooor.ai`. */
  issuer?: string;
  /** OAuth `client_id`. Defaults to `DOOOR_AUTH_PUBLISHABLE_KEY`, then `NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY`. */
  publishableKey?: string;
  /** Expected token audience (App id). Defaults to `DOOOR_AUTH_APP_ID`. When omitted, the callback/session handlers skip local claim verification and only decode the token set from the IdP response. */
  appId?: string;
  /** AES-256-GCM key material for the session/txn cookies. Defaults to `DOOOR_AUTH_COOKIE_SECRET`. Required. */
  cookieSecret?: string;
  /** Base path the route handler is mounted at. Must match the file path, e.g. `app/api/dooor-auth/[...route]/route.ts` -> `/api/dooor-auth`. */
  basePath?: string;
  /** Where to send the user after a successful sign-in when no `redirect_url` was provided. Defaults to `/`. */
  defaultRedirectUrl?: string;
  /** Name of the first-party session cookie. Defaults to `dooor_session`. */
  cookieName?: string;
  /** OAuth `scope` requested at authorize time. Defaults to `openid profile email`. */
  scope?: string;
}

export interface ResolvedDooorAuthConfig {
  issuer: string;
  publishableKey: string;
  appId?: string;
  cookieSecret: string;
  basePath: string;
  defaultRedirectUrl: string;
  cookieName: string;
  txnCookieName: string;
  scope?: string;
}

export function resolveConfig(options: CreateDooorAuthHandlerOptions = {}): ResolvedDooorAuthConfig {
  const issuer = options.issuer ?? process.env.DOOOR_AUTH_ISSUER ?? DEFAULT_ISSUER;

  const publishableKey =
    options.publishableKey ??
    process.env.DOOOR_AUTH_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new DooorAuthError(
      "Missing publishableKey: pass { publishableKey } or set DOOOR_AUTH_PUBLISHABLE_KEY / NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY.",
      "missing_publishable_key",
    );
  }

  const cookieSecret = options.cookieSecret ?? process.env.DOOOR_AUTH_COOKIE_SECRET;
  if (!cookieSecret) {
    throw new DooorAuthError(
      "Missing cookieSecret: pass { cookieSecret } or set DOOOR_AUTH_COOKIE_SECRET.",
      "missing_cookie_secret",
    );
  }

  return {
    issuer,
    publishableKey,
    appId: options.appId ?? process.env.DOOOR_AUTH_APP_ID,
    cookieSecret,
    basePath: options.basePath ?? "/api/dooor-auth",
    defaultRedirectUrl: options.defaultRedirectUrl ?? "/",
    cookieName: options.cookieName ?? "dooor_session",
    txnCookieName: `${options.cookieName ?? "dooor_session"}_txn`,
    scope: options.scope,
  };
}

/** Payload of the short-lived sign-in transaction cookie (PKCE + state, cleared right after the callback). */
export interface TxnCookiePayload {
  codeVerifier: string;
  state: string;
  redirectAfter: string;
}

/** Payload of the durable first-party session cookie. `refreshToken` never reaches the browser as JS-readable state. */
export interface SessionCookiePayload {
  refreshToken?: string;
  accessToken: string;
  expiresAt: number;
  user?: import("@dooor-ai/auth-core").DooorUser;
}
