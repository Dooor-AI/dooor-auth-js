# @dooor-ai/auth-react

React provider, hooks, and components for [Dooor Auth](https://auth.dooor.ai), plus a Next.js server entry (`@dooor-ai/auth-react/server`) with backend-for-frontend (BFF) route handlers and a middleware stub. See the [root README](../../README.md) for the full Next.js quickstart.

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

The route handler implements the full BFF flow: sign-in redirect (PKCE + `state` in a short-lived encrypted cookie), OAuth callback (code exchange), session read with transparent refresh, and sign-out. The session itself lives in an `HttpOnly`, `Secure` first-party cookie (`dooor_session` by default), encrypted with `DOOOR_AUTH_COOKIE_SECRET` (AES-256-GCM) - never a third-party or `Domain=.apps.dooor.ai` cookie (see PRD §6.3 for why).

`dooorAuthMiddleware` is a **stub**: it only checks whether the session cookie is present, not whether it's still valid (that check happens in the BFF `/session` route on every `useAuth()`/`useUser()` mount). Use it purely as a UX redirect guard, never as your source of truth for authorization.

## Environment variables

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY` | client provider, server handler (fallback) |
| `DOOOR_AUTH_PUBLISHABLE_KEY` | server handler |
| `DOOOR_AUTH_ISSUER` | server handler (defaults to `https://auth.dooor.ai`) |
| `DOOOR_AUTH_APP_ID` | server handler, to verify the access token's `aud` and decode the user |
| `DOOOR_AUTH_COOKIE_SECRET` | server handler, to encrypt the session/txn cookies |

All of these are injected automatically into apps deployed on the Dooor OS runtime; nothing to configure by hand there. For local dev, copy them from the app's "Auth" tab in the dashboard.

## License

MIT
