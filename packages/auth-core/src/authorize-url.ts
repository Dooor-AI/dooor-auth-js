import { AUTHORIZE_PATH, DEFAULT_ISSUER } from "./constants.js";
import type { BuildAuthorizeUrlOptions } from "./types.js";

/**
 * Builds the `/v1/idp/authorize` URL that starts the OAuth 2.1 authorization
 * code + PKCE flow against a Dooor Auth instance.
 */
export function buildAuthorizeUrl(options: BuildAuthorizeUrlOptions): string {
  const issuer = options.issuer ?? DEFAULT_ISSUER;
  const url = new URL(AUTHORIZE_PATH, issuer);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.publishableKey);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", options.codeChallengeMethod ?? "S256");
  url.searchParams.set("scope", options.scope ?? "openid profile email");

  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
