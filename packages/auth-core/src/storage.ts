import type { DooorTokenSet } from "./types.js";

/** Minimal token storage contract; implement against `localStorage`, a cookie jar, etc. */
export interface TokenStore {
  get(): DooorTokenSet | undefined;
  set(tokens: DooorTokenSet): void;
  clear(): void;
}

/**
 * In-memory token store. The default for `auth-core`: never persisted to
 * disk/localStorage, so it disappears on page reload or process restart.
 * `@dooor-ai/auth-react`'s BFF mode keeps the durable session server-side
 * in an HttpOnly cookie instead of relying on this for persistence.
 */
export class MemoryTokenStore implements TokenStore {
  private tokens: DooorTokenSet | undefined;

  get(): DooorTokenSet | undefined {
    return this.tokens;
  }

  set(tokens: DooorTokenSet): void {
    this.tokens = tokens;
  }

  clear(): void {
    this.tokens = undefined;
  }

  /** True when a token is stored and not yet past `expiresAt` (with an optional safety skew). */
  isFresh(skewMs = 0): boolean {
    return !!this.tokens && this.tokens.expiresAt - skewMs > Date.now();
  }
}
