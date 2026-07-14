import type { JWTPayload } from "jose";

/** Decoded and verified claims of a Dooor Auth access/id token. See PRD §6.4. */
export interface DooorTokenPayload extends JWTPayload {
  /** Principal id: `usr_...` in the `platform` realm, `apu_...` in the `app` realm. */
  sub: string;
  /** Always the target App's id; never valid across apps. */
  aud: string | string[];
  /** AuthSession id, for correlation and kill-switch revocation. */
  sid?: string;
  realm?: "platform" | "app";
  /** AppUser projection id. */
  app_user?: string;
  /** Workspace (org) id that owns the app. */
  org?: string;
  email?: string;
  roles?: string[];
}

export interface VerifyDooorTokenOptions {
  /**
   * Expected `aud` claim (the App id, `app_...`). Falls back to
   * `DOOOR_AUTH_APP_ID` from the environment when omitted.
   */
  audience?: string;
  /** Issuer base URL. Falls back to `DOOOR_AUTH_ISSUER`, then `https://auth.dooor.ai`. */
  issuer?: string;
  /** Overrides the JWKS endpoint. Defaults to `${issuer}/.well-known/jwks.json`. */
  jwksUrl?: string;
  /** JWKS cache TTL in ms before a background refetch is forced. Default 5 minutes. */
  jwksCacheTtlMs?: number;
  /** Test-only escape hatch to inject a custom `fetch` implementation. */
  fetchImpl?: typeof fetch;
}
