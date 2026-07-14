/** Default Dooor Auth issuer. Override via `issuer` option on any helper for self-hosted or non-prod environments. */
export const DEFAULT_ISSUER = "https://auth.dooor.ai";

export const AUTHORIZE_PATH = "/v1/idp/authorize";
export const TOKEN_PATH = "/v1/idp/token";
export const REVOKE_PATH = "/v1/idp/revoke";
export const USERINFO_PATH = "/v1/idp/userinfo";
export const JWKS_PATH = "/.well-known/jwks.json";
export const OPENID_CONFIGURATION_PATH = "/.well-known/openid-configuration";
