import { DEFAULT_ISSUER, DEFAULT_SCOPE, DooorAuthError } from "@dooor-ai/auth-core";

export interface CreateDooorAuthHandlerOptions {
  /** Dooor Auth issuer. Defaults to `DOOOR_AUTH_ISSUER`, then `https://api.os.dooor.ai`. */
  issuer?: string;
  /** OAuth `client_id`. Defaults to `DOOOR_AUTH_PUBLISHABLE_KEY`, then `NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY`. */
  publishableKey?: string;
  /** Expected token audience (App id). Defaults to `DOOOR_AUTH_APP_ID`. When omitted, the callback/session handlers skip local claim verification and only decode the token set from the IdP response. */
  appId?: string;
  /** AES-256-GCM key material for the session/txn cookies. Defaults to `DOOOR_AUTH_COOKIE_SECRET`. Required. */
  cookieSecret?: string;
  /**
   * Public origin the browser uses to reach this app, e.g.
   * `https://myapp.example.com`. Defaults to `DOOOR_AUTH_APP_URL`.
   *
   * Set this whenever the app runs behind a reverse proxy. Without it the SDK
   * falls back to the forwarded headers and then to the request URL, which in
   * a container is an internal address — and an internal address in
   * `redirect_uri` is rejected by the IdP. Path, query and port are taken from
   * the value; only the origin is used.
   */
  appUrl?: string;
  /** Base path the route handler is mounted at. Must match the file path, e.g. `app/api/dooor-auth/[...route]/route.ts` -> `/api/dooor-auth`. */
  basePath?: string;
  /** Where to send the user after a successful sign-in when no `redirect_url` was provided. Defaults to `/`. */
  defaultRedirectUrl?: string;
  /** Name of the first-party session cookie. Defaults to `dooor_session`. */
  cookieName?: string;
  /** OAuth `scope` requested at authorize time. Defaults to `openid profile email offline_access`. */
  scope?: string;
  /** Where to send the browser when sign-in fails. Defaults to `DOOOR_AUTH_ERROR_URL`, then the built-in `${basePath}/error` page. */
  errorUrl?: string;
}

export interface ResolvedDooorAuthConfig {
  issuer: string;
  publishableKey: string;
  appId?: string;
  cookieSecret: string;
  appUrl?: string;
  basePath: string;
  defaultRedirectUrl: string;
  cookieName: string;
  txnCookieName: string;
  scope: string;
  errorUrl?: string;
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
  if (cookieSecret.length < 32) {
    throw new DooorAuthError(
      "cookieSecret must contain at least 32 characters of high-entropy key material.",
      "weak_cookie_secret",
    );
  }

  const appUrl = options.appUrl ?? process.env.DOOOR_AUTH_APP_URL;
  if (appUrl !== undefined) {
    let parsed: URL;
    try {
      parsed = new URL(appUrl);
    } catch {
      throw new DooorAuthError(
        `appUrl must be an absolute URL such as https://myapp.example.com (received ${appUrl}).`,
        "invalid_app_url",
      );
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new DooorAuthError(
        `appUrl must use http or https (received ${parsed.protocol}).`,
        "invalid_app_url",
      );
    }
  }

  return {
    issuer,
    publishableKey,
    appId: options.appId ?? process.env.DOOOR_AUTH_APP_ID,
    cookieSecret,
    appUrl,
    basePath: options.basePath ?? "/api/dooor-auth",
    defaultRedirectUrl: options.defaultRedirectUrl ?? "/",
    cookieName: options.cookieName ?? "dooor_session",
    txnCookieName: `${options.cookieName ?? "dooor_session"}_txn`,
    scope: options.scope ?? DEFAULT_SCOPE,
    errorUrl: options.errorUrl ?? process.env.DOOOR_AUTH_ERROR_URL,
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
