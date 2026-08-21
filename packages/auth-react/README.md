# @dooor-ai/auth-react

React provider, hooks, and components for [Dooor Auth](https://api.os.dooor.ai), plus a Next.js server entry (`@dooor-ai/auth-react/server`) with backend-for-frontend (BFF) route handlers and an AES-GCM-validating middleware. See the [root README](../../README.md) for the full Next.js quickstart.

## Install

```bash
npm i @dooor-ai/auth-react @dooor-ai/auth-node
```

## Client

```tsx
// app/layout.tsx
import { DooorAuthProvider } from "@dooor-ai/auth-react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <DooorAuthProvider publishableKey={process.env.NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY!}>
      {children}
    </DooorAuthProvider>
  );
}
```

```tsx
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@dooor-ai/auth-react";

function Header() {
  const { user } = useUser();
  return (
    <header>
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <UserButton /> Olá, {user?.name}
      </SignedIn>
    </header>
  );
}
```

`useAuth()` exposes `getToken()` for calling your own backend:

```tsx
const { getToken } = useAuth();
const token = await getToken();
await fetch("/api/my-endpoint", { headers: { Authorization: `Bearer ${token}` } });
```

`<UserButton/>` renders an avatar with a dropdown (identity, your own entries, sign out). Pass `menuItems`, `showName`, `afterSignOutUrl`, or `disableMenu` for the bare avatar.

## Server (Next.js)

```ts
// app/api/dooor-auth/[...route]/route.ts
import { createDooorAuthHandler } from "@dooor-ai/auth-react/server";
export const { GET, POST } = createDooorAuthHandler();
```

```ts
// middleware.ts
import { dooorAuthMiddleware } from "@dooor-ai/auth-react/server";
export default dooorAuthMiddleware({ publicRoutes: ["/", "/sign-in(.*)"] });
```

### Reading the session on the server

`auth()`, `currentUser()`, `getToken()` and `requireAuth()` work in Server Components, Server Actions, Route Handlers, and `generateMetadata`:

```tsx
import { auth, getToken } from "@dooor-ai/auth-react/server";

export default async function Page() {
  const { isSignedIn, user, roles, orgId } = await auth();
  if (!isSignedIn) return <SignInPrompt />;

  // Call your own backend; it verifies this token offline with @dooor-ai/auth-node.
  const token = await getToken();
  const data = await fetch(`${process.env.API_URL}/reports`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  }).then((r) => r.json());

  return <Reports data={data} user={user} />;
}
```

Outside Next.js (or when you already hold the request) pass the source explicitly: `auth({ request })`, where `request` is a `Request` or a raw `Cookie` header.

Reading the session makes a route dynamic, as it must - a page whose content depends on who is signed in cannot be prerendered.

These helpers are **read-only**: they never redeem the refresh token. Redeeming a rotating refresh token somewhere the new cookie cannot be written would invalidate the stored one and break the session. Renewal belongs to `dooorAuthMiddleware`, which runs before the render, and to the BFF `/session` endpoint the client provider calls. On a protected route the middleware has already refreshed the cookie, so `getToken()` returns a live token; it returns `null` once the token is past expiry.

The route handler implements the full BFF flow: sign-in redirect (PKCE + `state` in a short-lived encrypted cookie), OAuth callback (code exchange), session read with transparent refresh, and sign-out. The session itself lives in an `HttpOnly`, `Secure` first-party cookie (`dooor_session` by default), encrypted with `DOOOR_AUTH_COOKIE_SECRET` (AES-256-GCM) - never a third-party or `Domain=.apps.dooor.ai` cookie (see PRD §6.3 for why).

`dooorAuthMiddleware` decrypts and authenticates the first-party AES-GCM session cookie with Web Crypto, including Edge runtimes, and rejects forged, corrupted, or structurally invalid cookies. When the access token has expired it redeems the refresh token and rewrites the cookie in place, so the request continues with a live token instead of bouncing the user through sign-in; a refusal from the IdP ends the session. Set `refreshTokens: false` to leave renewal entirely to the BFF. Central revocation and business authorization remain in the BFF and server route handlers. Post-login redirects are restricted to the mini app's own origin, and `signOut()` revokes the central IdP refresh session before clearing the local cookie.

If you mount the route handler somewhere other than `/api/dooor-auth`, pass the same `basePath` to both - otherwise the middleware guards the auth routes themselves and the sign-in redirect loops:

```ts
// app/api/auth/[...route]/route.ts
export const { GET, POST } = createDooorAuthHandler({ basePath: "/api/auth" });

// middleware.ts
export default dooorAuthMiddleware({ basePath: "/api/auth" });
```

## Environment variables

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY` | client provider, server handler (fallback) |
| `DOOOR_AUTH_PUBLISHABLE_KEY` | server handler |
| `DOOOR_AUTH_ISSUER` | server handler (defaults to `https://api.os.dooor.ai`) |
| `DOOOR_AUTH_APP_ID` | server handler, to verify the access token's `aud` and decode the user |
| `DOOOR_AUTH_COOKIE_SECRET` | server handler and middleware, to encrypt the session/txn cookies |
| `DOOOR_AUTH_ERROR_URL` | optional: your own page for failed sign-ins (defaults to the built-in `${basePath}/error`) |

All of these are injected automatically into apps deployed on the Dooor OS runtime; nothing to configure by hand there. For local dev, copy them from the app's "Auth" tab in the dashboard.

## Sign-in failures

A failed callback (user denied consent, `state` mismatch, expired transaction cookie) redirects to `${basePath}/error?reason=...`, which renders a plain built-in page. Point `errorUrl` (or `DOOOR_AUTH_ERROR_URL`) at your own route to style it; the `reason` query param is passed through.

## Example

A complete Next.js app lives in [`examples/nextjs-minimal`](../../examples/nextjs-minimal).

## License

MIT
