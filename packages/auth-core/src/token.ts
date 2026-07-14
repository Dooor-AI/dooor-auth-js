import { DEFAULT_ISSUER, TOKEN_PATH } from "./constants.js";
import { postForm } from "./http.js";
import type { DooorTokenSet, ExchangeCodeOptions, RefreshTokenOptions } from "./types.js";

interface RawTokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: "Bearer";
  expires_in: number;
  scope?: string;
}

function toTokenSet(raw: RawTokenResponse): DooorTokenSet {
  return {
    accessToken: raw.access_token,
    idToken: raw.id_token,
    refreshToken: raw.refresh_token,
    tokenType: raw.token_type,
    expiresIn: raw.expires_in,
    expiresAt: Date.now() + raw.expires_in * 1000,
    scope: raw.scope,
  };
}

/**
 * Exchanges an authorization `code` (from the callback) plus the matching
 * PKCE `code_verifier` for a token set. Server-to-server call; never expose
 * `code_verifier` handling to a third party.
 */
export async function exchangeCode(options: ExchangeCodeOptions): Promise<DooorTokenSet> {
  const issuer = options.issuer ?? DEFAULT_ISSUER;
  const raw = await postForm<RawTokenResponse>(new URL(TOKEN_PATH, issuer).toString(), {
    grant_type: "authorization_code",
    code: options.code,
    code_verifier: options.codeVerifier,
    client_id: options.publishableKey,
    redirect_uri: options.redirectUri,
  });
  return toTokenSet(raw);
}

/**
 * Redeems a rotating refresh token for a new token set. The IdP re-runs the
 * `canIssueToken` cascade on every refresh, so a blocked principal or banned
 * app user is denied here even with a still-valid refresh token.
 */
export async function refreshToken(options: RefreshTokenOptions): Promise<DooorTokenSet> {
  const issuer = options.issuer ?? DEFAULT_ISSUER;
  const raw = await postForm<RawTokenResponse>(new URL(TOKEN_PATH, issuer).toString(), {
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.publishableKey,
  });
  return toTokenSet(raw);
}
