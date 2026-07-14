export interface SerializeCookieOptions {
  path?: string;
  maxAge?: number;
  sameSite?: "lax" | "strict" | "none";
  httpOnly?: boolean;
  secure?: boolean;
}

/** Builds a `Set-Cookie` header value. Defaults to `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. */
export function serializeCookie(name: string, value: string, options: SerializeCookieOptions = {}): string {
  const parts = [`${name}=${value}`, `Path=${options.path ?? "/"}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.httpOnly ?? true) parts.push("HttpOnly");
  if (options.secure ?? true) parts.push("Secure");
  return parts.join("; ");
}

/** Builds the `Set-Cookie` header value that clears a previously-set cookie. */
export function clearCookie(name: string, options: Omit<SerializeCookieOptions, "maxAge"> = {}): string {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}

/** Parses a `Cookie` request header into a plain name/value map. */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

/** JSON response helper. Never caches (BFF endpoints reflect per-user session state). */
export function jsonResponse(body: unknown, headers = new Headers(), status = 200): Response {
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}
