/** A Dooor Auth end-user, decoded from the ID token / userinfo endpoint. */
export interface DooorUser {
  /** Principal id: `usr_...` in the `platform` realm, `apu_...` in the `app` realm. */
  id: string;
  email: string;
  name?: string;
  image?: string;
  /** Roles resolved for the current app at token issuance time. */
  roles?: string[];
  /** Workspace (org) id that owns the app. */
  orgId?: string;
  realm?: "platform" | "app";
  [claim: string]: unknown;
}

/** Token set returned by the `/v1/idp/token` endpoint. */
export interface DooorTokenSet {
  accessToken: string;
  idToken?: string;
  /** Opaque, rotating refresh token (`dor_rt_...`). Absent in SPA-only flows without refresh support. */
  refreshToken?: string;
  tokenType: "Bearer";
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Absolute epoch milliseconds the access token expires at. Computed client-side from `expiresIn`. */
  expiresAt: number;
  scope?: string;
}

export type CodeChallengeMethod = "S256";

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: CodeChallengeMethod;
}

export interface DooorAuthClientConfig {
  /** Dooor Auth issuer base URL. Defaults to `https://auth.dooor.ai`. */
  issuer?: string;
  /** Publishable key of the AuthInstance (`dor_pk_...`), used as the OAuth `client_id`. */
  publishableKey: string;
  /** Redirect URI registered (or auto-managed) for this app. */
  redirectUri: string;
}

export interface BuildAuthorizeUrlOptions extends DooorAuthClientConfig {
  state: string;
  codeChallenge: string;
  codeChallengeMethod?: CodeChallengeMethod;
  scope?: string;
  /** Extra query params merged into the authorize URL (e.g. `prompt`, `login_hint`). */
  extraParams?: Record<string, string>;
}

export interface ParsedCallback {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface ExchangeCodeOptions extends DooorAuthClientConfig {
  code: string;
  codeVerifier: string;
}

export interface RefreshTokenOptions {
  issuer?: string;
  publishableKey: string;
  refreshToken: string;
}

export class DooorAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DooorAuthError";
  }
}
