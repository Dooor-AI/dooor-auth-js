# Dooor Auth JS SDKs

Client and server SDKs for [Dooor Auth](https://auth.dooor.ai): an OIDC-compliant identity provider with login-in-minutes DX (`<SignIn/>`, `useUser()`, `requireDooorAuth()`) and offline, JWKS-based token verification. Open standards under the hood: OAuth 2.1 authorization code + PKCE, OIDC discovery. Prefer a generic OIDC client instead? You can - the SDKs are sugar, never a requirement.

| Package | What it's for |
|---|---|
| [`@dooor-ai/auth-core`](./packages/auth-core) | Framework-agnostic OIDC client helpers (authorize URL, PKCE, callback parsing, token exchange/refresh). Zero framework deps. |
| [`@dooor-ai/auth-node`](./packages/auth-node) | Server-side, offline token verification via JWKS (cached by `kid`), plus an Express middleware and a generic guard for any framework. |
| [`@dooor-ai/auth-react`](./packages/auth-react) | React provider/hooks/components, and a Next.js server entry with BFF route handlers + a middleware stub. |

## Quickstart (Next.js)

```bash
npm i @dooor-ai/auth-react @dooor-ai/auth-node
```

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

```ts
// app/api/dooor-auth/[...route]/route.ts  (the BFF; 1 file, zero config)
import { createDooorAuthHandler } from "@dooor-ai/auth-react/server";
export const { GET, POST } = createDooorAuthHandler();
```

```ts
// middleware.ts
import { dooorAuthMiddleware } from "@dooor-ai/auth-react/server";
export default dooorAuthMiddleware({ publicRoutes: ["/", "/sign-in(.*)"] });
```

```tsx
// any component
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@dooor-ai/auth-react";

function Header() {
  const { user } = useUser();
  return (
    <header>
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <UserButton /> Hello, {user?.name}
      </SignedIn>
    </header>
  );
}
```

```ts
// your app's backend (Express/Nest/Fastify): offline verification via JWKS
import { requireDooorAuth } from "@dooor-ai/auth-node/express";

app.use(requireDooorAuth()); // issuer and audience come from injected env vars
app.get("/me", (req, res) => res.json(req.dooor)); // { sub, aud, org, roles, email, ... }
```

No env var needs to be created by hand when the app is deployed on the Dooor OS runtime: `DOOOR_AUTH_*` and `NEXT_PUBLIC_DOOOR_AUTH_*` are already in the container. For local dev, copy them from the app's "Auth" tab in the dashboard.

### Env vars reference

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY` | client provider (`dor_pk_...`, public) |
| `DOOOR_AUTH_ISSUER` | server handler / `auth-node` (defaults to `https://auth.dooor.ai`) |
| `DOOOR_AUTH_APP_ID` | server handler / `auth-node` (expected token audience) |
| `DOOOR_AUTH_COOKIE_SECRET` | server handler (encrypts the first-party BFF session cookie; keep secret) |

## How the pieces fit together

```
end-user  ──▶  your app (Next.js, using @dooor-ai/auth-react)
                 │  BFF route handlers do the OAuth dance server-side
                 ▼
          auth.dooor.ai (Dooor Auth IdP)  ──▶  Google / Magic Link
                 │
                 ▼
          your app's backend  ──▶  @dooor-ai/auth-node verifies the
                                    access token offline via JWKS
                                    (no secret shared with Dooor)
```

- The end-user's session lives in an `HttpOnly`, first-party cookie on **your app's own domain** - never a third-party cookie on `auth.dooor.ai`, and never `localStorage`.
- Access tokens are short-lived JWTs (RS256, 5 min default TTL) signed by Dooor Auth's rotating key pair. Any backend can verify them offline against the public JWKS, without ever calling back to Dooor Auth.
- Refresh tokens are opaque, rotate on every use, and re-run the platform's access cascade (workspace active? auth enabled? principal not blocked? app user not banned?) on every refresh - so a block/ban propagates to your app within the access token's TTL.

## Not using Next.js / React?

`@dooor-ai/auth-core` and `@dooor-ai/auth-node` have no framework dependency. Build the authorize URL, do the PKCE dance, exchange the code, and verify tokens from any Node.js backend or any OIDC-compliant client library - Dooor Auth speaks standard OAuth 2.1 + OIDC discovery (`/.well-known/openid-configuration`, `/.well-known/jwks.json`).

## Development

This is a pnpm workspace monorepo using [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
pnpm install
pnpm build      # builds every package (tsup: ESM + CJS + .d.ts)
pnpm test       # runs the vitest suite for every package
pnpm typecheck
```

To add a changeset before a release: `pnpm changeset`. Packages are not published automatically; publishing to npm is a manual, deliberate step (`pnpm release`) once CI is wired up.

## License

MIT
