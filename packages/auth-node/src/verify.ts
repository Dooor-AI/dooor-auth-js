import { DEFAULT_ISSUER, DooorAuthError, JWKS_PATH } from "@dooor-ai/auth-core";
import { jwtVerify } from "jose";
import { JwksCache } from "./jwks-cache.js";
import type { DooorTokenPayload, VerifyDooorTokenOptions } from "./types.js";

const ALLOWED_ALGS = ["RS256"];

const cachesByJwksUrl = new Map<string, JwksCache>();

function getCache(jwksUrl: string, ttlMs: number | undefined, fetchImpl: typeof fetch | undefined): JwksCache {
  const key = `${jwksUrl}:${ttlMs ?? "default"}`;
  let cache = cachesByJwksUrl.get(key);
  if (!cache) {
    cache = new JwksCache({ jwksUrl, ttlMs, fetchImpl });
    cachesByJwksUrl.set(key, cache);
  }
  return cache;
}

/** Clears the module-level JWKS cache. Intended for tests only. */
export function __resetJwksCacheForTests(): void {
  cachesByJwksUrl.clear();
}

/**
 * Verifies a Dooor Auth access/id token entirely offline: fetches the
 * issuer's public JWKS (cached by `kid`), checks signature, `iss`, `aud`,
 * and expiry, and allowlists `RS256` only (rejects `alg: none` and any
 * symmetric-algorithm downgrade attempt).
 */
export async function verifyDooorToken(
  token: string,
  options: VerifyDooorTokenOptions = {},
): Promise<DooorTokenPayload> {
  const issuer = options.issuer ?? process.env.DOOOR_AUTH_ISSUER ?? DEFAULT_ISSUER;
  const audience = options.audience ?? process.env.DOOOR_AUTH_APP_ID;

  if (!audience) {
    throw new DooorAuthError(
      "audience is required: pass { audience } or set DOOOR_AUTH_APP_ID",
      "missing_audience",
    );
  }

  const jwksUrl = options.jwksUrl ?? new URL(JWKS_PATH, issuer).toString();
  const cache = getCache(jwksUrl, options.jwksCacheTtlMs, options.fetchImpl);

  try {
    const { payload } = await jwtVerify(
      token,
      async (header) => {
        if (!header.alg || !ALLOWED_ALGS.includes(header.alg)) {
          throw new DooorAuthError(
            `Algorithm "${header.alg}" is not allowed; only RS256 is accepted`,
            "alg_not_allowed",
          );
        }
        if (!header.kid) {
          throw new DooorAuthError("Token is missing a kid header", "missing_kid");
        }
        return cache.getKey(header.kid);
      },
      {
        issuer,
        audience,
        algorithms: ALLOWED_ALGS,
      },
    );

    return payload as DooorTokenPayload;
  } catch (error) {
    if (error instanceof DooorAuthError) throw error;
    throw new DooorAuthError(
      error instanceof Error ? error.message : "Token verification failed",
      "invalid_token",
      error,
    );
  }
}
