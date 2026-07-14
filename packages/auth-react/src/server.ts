import {
  exchangeCode,
  refreshToken as refreshTokenGrant,
} from "@dooor-ai/auth-core";

const COOKIE_NAME = "__dooor_auth_rt";

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function issuer(): string {
  return (
    env("DOOOR_AUTH_ISSUER") ||
    env("NEXT_PUBLIC_DOOOR_AUTH_ISSUER") ||
    "https://auth.dooor.ai"
  ).replace(/\/$/, "");
}

function publishableKey(): string {
  return (
    env("DOOOR_AUTH_PUBLISHABLE_KEY") ||
    env("NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY")
  );
}

function cookieOptions(maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production";
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  const match = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Next.js App Router route handlers for `/api/dooor-auth/[...route]`.
 * Handles callback (code exchange), session, refresh, and sign-out.
 */
export function createDooorAuthHandler() {
  async function GET(
    req: Request,
    ctx: { params: Promise<{ route?: string[] }> },
  ) {
    const { route = [] } = await ctx.params;
    const path = route.join("/");
    const url = new URL(req.url);

    if (path === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        return Response.redirect(new URL("/?error=missing_code", url.origin));
      }
      // PKCE verifier must be recovered from a short-lived cookie or storage
      // set by the client before redirect. For v0 we expect
      // `dooor_pkce_verifier` cookie set by the app during signIn.
      const verifier = readCookie(req, "dooor_pkce_verifier");
      if (!verifier) {
        return Response.redirect(new URL("/?error=missing_verifier", url.origin));
      }
      const tokens = await exchangeCode({
        code,
        codeVerifier: verifier,
        redirectUri: `${url.origin}/api/dooor-auth/callback`,
        publishableKey: publishableKey(),
        issuer: issuer(),
      });
      const headers = new Headers();
      if (tokens.refreshToken) {
        headers.append(
          "Set-Cookie",
          `${COOKIE_NAME}=${encodeURIComponent(tokens.refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`,
        );
      }
      headers.append(
        "Set-Cookie",
        "dooor_pkce_verifier=; Path=/; Max-Age=0",
      );
      headers.set("Location", "/");
      return new Response(null, { status: 302, headers });
    }

    if (path === "session") {
      const rt = readCookie(req, COOKIE_NAME);
      if (!rt) return Response.json({ accessToken: null }, { status: 200 });
      try {
        const tokens = await refreshTokenGrant({
          refreshToken: rt,
          publishableKey: publishableKey(),
          issuer: issuer(),
        });
        const headers = new Headers({ "content-type": "application/json" });
        if (tokens.refreshToken && tokens.refreshToken !== rt) {
          headers.append(
            "Set-Cookie",
            `${COOKIE_NAME}=${encodeURIComponent(tokens.refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`,
          );
        }
        return new Response(
          JSON.stringify({
            accessToken: tokens.accessToken,
            user: null,
          }),
          { status: 200, headers },
        );
      } catch {
        return new Response(JSON.stringify({ accessToken: null }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Set-Cookie": cookieOptions(0).replace(
              `${COOKIE_NAME}=`,
              `${COOKIE_NAME}=;`,
            ),
          },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  }

  async function POST(
    req: Request,
    ctx: { params: Promise<{ route?: string[] }> },
  ) {
    const { route = [] } = await ctx.params;
    const path = route.join("/");
    if (path === "sign-out") {
      return new Response(null, {
        status: 204,
        headers: {
          "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        },
      });
    }
    return new Response("Not found", { status: 404 });
  }

  return { GET, POST };
}

export interface DooorAuthMiddlewareOptions {
  publicRoutes?: string[];
}

/**
 * Lightweight Next middleware helper: redirects unauthenticated users away
 * from protected routes. Checks for the HttpOnly refresh cookie only —
 * does not cryptographically validate it (BFF refresh does that).
 */
export function dooorAuthMiddleware(
  options: DooorAuthMiddlewareOptions = {},
) {
  const publicRoutes = options.publicRoutes ?? ["/", "/sign-in(.*)"];
  return function middleware(req: {
    nextUrl: URL;
    cookies: { get: (name: string) => { value: string } | undefined };
  }) {
    const path = req.nextUrl.pathname;
    const isPublic = publicRoutes.some((pattern) => {
      const re = new RegExp(`^${pattern.replace("(.*)", ".*")}$`);
      return re.test(path);
    });
    if (isPublic) return; // caller should NextResponse.next()
    const hasSession = Boolean(req.cookies.get(COOKIE_NAME)?.value);
    if (!hasSession) {
      return { redirectTo: "/sign-in" as const };
    }
    return;
  };
}
