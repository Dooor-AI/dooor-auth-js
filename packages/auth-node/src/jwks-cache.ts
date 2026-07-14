import { DooorAuthError } from "@dooor-ai/auth-core";
import { importJWK, type JWK } from "jose";

type ImportedKey = Awaited<ReturnType<typeof importJWK>>;

export interface JwksCacheOptions {
  jwksUrl: string;
  /** Cache TTL in ms before a background refetch is forced even for known kids. Default 5 minutes. */
  ttlMs?: number;
  fetchImpl?: typeof fetch;
}

interface JwkSetResponse {
  keys: JWK[];
}

const ALLOWED_ALG = "RS256";

/**
 * Caches JWKS public keys by `kid`. Refetches the whole set when the TTL
 * expires, or immediately when an unknown `kid` is requested, so key
 * rotation (a new `kid` appears in the JWKS) is picked up without waiting
 * out the TTL.
 */
export class JwksCache {
  private keys = new Map<string, ImportedKey>();
  private fetchedAt = 0;
  private inflight: Promise<void> | undefined;
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  private fetchCount = 0;

  constructor(private readonly options: JwksCacheOptions) {
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getKey(kid: string): Promise<ImportedKey> {
    const isStale = Date.now() - this.fetchedAt > this.ttlMs;
    if (isStale || !this.keys.has(kid)) {
      await this.refetch();
    }

    const key = this.keys.get(kid);
    if (!key) {
      throw new DooorAuthError(`No JWKS key found for kid "${kid}"`, "unknown_kid");
    }
    return key;
  }

  /** Number of network fetches performed so far. Exposed for tests. */
  get fetchCalls(): number {
    return this.fetchCount;
  }

  private async refetch(): Promise<void> {
    if (this.inflight) {
      await this.inflight;
      return;
    }

    this.inflight = (async () => {
      this.fetchCount += 1;
      const response = await this.fetchImpl(this.options.jwksUrl, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new DooorAuthError(
          `Failed to fetch JWKS from ${this.options.jwksUrl}: HTTP ${response.status}`,
          "jwks_fetch_failed",
        );
      }

      const body = (await response.json()) as JwkSetResponse;
      const imported = new Map<string, ImportedKey>();

      for (const jwk of body.keys ?? []) {
        if (!jwk.kid) continue;
        if (jwk.alg && jwk.alg !== ALLOWED_ALG) continue; // defense in depth; verify.ts also allowlists
        imported.set(jwk.kid, await importJWK(jwk, jwk.alg ?? ALLOWED_ALG));
      }

      this.keys = imported;
      this.fetchedAt = Date.now();
    })();

    try {
      await this.inflight;
    } finally {
      this.inflight = undefined;
    }
  }
}
