/** Default Dooor Auth issuer. Override via `issuer` option on any helper for self-hosted or non-prod environments. */
export const DEFAULT_ISSUER = "https://api.os.dooor.ai";

export const AUTHORIZE_PATH = "/v1/idp/authorize";
export const TOKEN_PATH = "/v1/idp/token";
export const REVOKE_PATH = "/v1/idp/revoke";
export const USERINFO_PATH = "/v1/idp/userinfo";
export const JWKS_PATH = "/.well-known/jwks.json";
export const OPENID_CONFIGURATION_PATH = "/.well-known/openid-configuration";

/**
 * Default OAuth scope. Includes `offline_access` so the IdP issues a rotating
 * refresh token - without it the session dies when the 5-minute access token
 * expires. Advertised by the issuer under `scopes_supported`.
 */
export const DEFAULT_SCOPE = "openid profile email offline_access";
