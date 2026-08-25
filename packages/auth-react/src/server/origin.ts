/**
 * Resolving the origin the *browser* used, which is not the origin the process
 * sees.
 *
 * `new URL(request.url).origin` is the latter. Behind a reverse proxy — how
 * essentially every deployed app runs — it is an internal address such as
 * `http://localhost:3000`, and deriving a `redirect_uri` from it produces a
 * URI the IdP rightly rejects with "redirect_uri is not on this app's
 * allowlist". The same mistake makes the middleware's sign-in redirect point
 * the browser at the container's own loopback address.
 *
 * Precedence, most trusted first:
 *
 * 1. `appUrl` (option or `DOOOR_AUTH_APP_URL`). Deterministic and the only
 *    source no client can influence. The Dooor OS runtime injects it.
 * 2. `x-forwarded-host` / `x-forwarded-proto`, written by the proxy.
 * 3. The `Host` header, unless it names a loopback address.
 * 4. The request URL, unchanged.
 *
 * On trusting headers: 2 and 3 are client-controllable whenever no proxy
 * overwrites them, so a forged `Host` can push a foreign `redirect_uri` into
 * the authorize call. That attack dead-ends at the IdP, which matches
 * `redirect_uri` against the instance allowlist by exact string — a host the
 * app does not own is never on it. Setting `appUrl` removes the question
 * altogether, which is why it wins.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/** Forwarded headers are comma-separated lists; the client-most value comes first. */
function firstValue(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function isLoopback(host: string): boolean {
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/** Origin of `appUrl`, or `null` when unset or unparseable. */
function configuredOrigin(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    return new URL(appUrl).origin;
  } catch {
    return null;
  }
}

export function resolvePublicOrigin(request: Request, appUrl?: string): string {
  const configured = configuredOrigin(appUrl);
  if (configured) return configured;

  const requestUrl = new URL(request.url);
  const proto =
    firstValue(request.headers.get("x-forwarded-proto")) ?? requestUrl.protocol.replace(/:$/, "");

  const forwardedHost = firstValue(request.headers.get("x-forwarded-host"));
  if (forwardedHost) return `${proto}://${forwardedHost}`;

  const host = firstValue(request.headers.get("host"));
  if (host && !isLoopback(host)) return `${proto}://${host}`;

  return requestUrl.origin;
}

/**
 * The request URL rebased onto the public origin. Path, query and hash are
 * preserved, so every `url.origin` and same-origin comparison downstream
 * operates on the origin the browser will actually be sent back to.
 */
export function resolveRequestUrl(request: Request, appUrl?: string): URL {
  const url = new URL(request.url);
  const origin = resolvePublicOrigin(request, appUrl);
  if (origin === url.origin) return url;
  return new URL(`${url.pathname}${url.search}${url.hash}`, origin);
}
