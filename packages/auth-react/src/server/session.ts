import type { DooorUser } from "@dooor-ai/auth-core";
import { decryptCookiePayload } from "./cookie-crypto.js";
import { parseCookies } from "./http.js";
import type { SessionCookiePayload } from "./config.js";

/** Shape of `cookies()` from `next/headers`, across the sync (Next 14) and async (Next 15+) signatures. */
type NextCookies = () =>
  | Promise<{ get(name: string): { value: string } | undefined }>
  | { get(name: string): { value: string } | undefined };

/** Safety margin so a token about to expire is never handed to a caller. */
const EXPIRY_SKEW_MS = 15_000;

export interface ReadSessionOptions {
  /** Name of the session cookie. Must match `createDooorAuthHandler`'s `cookieName` (default `dooor_session`). */
  cookieName?: string;
  /** AES-256-GCM secret used by the BFF. Defaults to `DOOOR_AUTH_COOKIE_SECRET`. */
  cookieSecret?: string;
  /**
   * Where to read cookies from. Defaults to `cookies()` from `next/headers`.
   * Pass a `Request` (or a raw `Cookie` header string) to read the session
   * outside Next.js, or inside a handler that already has the request.
   */
  request?: Request | string;
}

export interface DooorServerSession {
  isSignedIn: boolean;
  /** Principal id (`usr_...` / `apu_...`), or `null` when signed out. */
  userId: string | null;
  user: DooorUser | null;
  orgId: string | null;
  roles: string[];
  /**
   * The current access token, or `null` when signed out or expired. Pass it as
   * `Authorization: Bearer` to your backend, which verifies it offline with
   * `@dooor-ai/auth-node`.
   */
  accessToken: string | null;
  /** Absolute epoch ms the access token expires at. */
  expiresAt: number | null;
  /** True when a session cookie exists but its access token is past expiry. */
  isExpired: boolean;
}

const SIGNED_OUT: DooorServerSession = {
  isSignedIn: false,
  userId: null,
  user: null,
  orgId: null,
  roles: [],
  accessToken: null,
  expiresAt: null,
  isExpired: false,
};

/** Normalizes the explicit cookie source (`Request` or raw `Cookie` header) into a header string. */
function readCookieHeader(source: Request | string): string | null {
  return typeof source === "string" ? source : source.headers.get("cookie");
}

async function readSessionCookie(options: ReadSessionOptions): Promise<SessionCookiePayload | undefined> {
  const cookieName = options.cookieName ?? "dooor_session";
  const cookieSecret = options.cookieSecret ?? process.env.DOOOR_AUTH_COOKIE_SECRET;
  if (!cookieSecret) return undefined;

  let raw: string | undefined;

  if (options.request === undefined) {
    let cookies: NextCookies;
    try {
      ({ cookies } = (await import("next/headers")) as { cookies: NextCookies });
    } catch {
      // Not running inside Next.js and no explicit request was given.
      return undefined;
    }

    // Deliberately outside the try: `cookies()` throws Next's dynamic-usage
    // bail-out during prerendering, and that error MUST propagate so the route
    // is marked dynamic. Swallowing it would prerender the page as signed out
    // and serve that cached HTML to signed-in users.
    raw = (await cookies()).get(cookieName)?.value;
  } else {
    const header = readCookieHeader(options.request);
    raw = parseCookies(header)[cookieName];
  }

  if (!raw) return undefined;
  return await decryptCookiePayload<SessionCookiePayload>(cookieSecret, raw);
}

/**
 * Reads the Dooor Auth session on the server: Server Components, Server
 * Actions, Route Handlers, `generateMetadata`, anywhere `cookies()` works.
 *
 * ```ts
 * const { isSignedIn, user } = await auth();
 * ```
 *
 * Read-only by design. It never redeems the refresh token, because a rotating
 * refresh token redeemed where the new cookie cannot be written would
 * invalidate the stored one. Renewal belongs to `dooorAuthMiddleware` (which
 * runs before the render and rewrites the cookie) and to the BFF `/session`
 * endpoint the client provider calls.
 */
export async function auth(options: ReadSessionOptions = {}): Promise<DooorServerSession> {
  const session = await readSessionCookie(options);
  if (!session?.accessToken) return SIGNED_OUT;

  const isExpired = session.expiresAt - EXPIRY_SKEW_MS <= Date.now();

  return {
    isSignedIn: !isExpired,
    userId: session.user?.id ?? null,
    user: session.user ?? null,
    orgId: session.user?.orgId ?? null,
    roles: session.user?.roles ?? [],
    accessToken: isExpired ? null : session.accessToken,
    expiresAt: session.expiresAt,
    isExpired,
  };
}

/** The signed-in end-user, or `null`. Sugar over `auth()` for the common case. */
export async function currentUser(options: ReadSessionOptions = {}): Promise<DooorUser | null> {
  return (await auth(options)).user;
}

/**
 * The current access token, or `null` when signed out or expired. Use it to
 * call your own backend from the server:
 *
 * ```ts
 * const token = await getToken();
 * const res = await fetch(`${API}/me`, { headers: { authorization: `Bearer ${token}` } });
 * ```
 */
export async function getToken(options: ReadSessionOptions = {}): Promise<string | null> {
  return (await auth(options)).accessToken;
}

/** Throws when there is no live session; returns it otherwise. Useful at the top of a protected Server Component. */
export async function requireAuth(options: ReadSessionOptions = {}): Promise<DooorServerSession> {
  const session = await auth(options);
  if (!session.isSignedIn) {
    throw new Error(
      "No Dooor Auth session. Protect this route with `dooorAuthMiddleware`, or handle the signed-out case with `auth()`.",
    );
  }
  return session;
}
