# Dooor Auth - minimal Next.js example

The whole integration, in five files:

| File | What it does |
|---|---|
| `app/api/dooor-auth/[...route]/route.ts` | The BFF: sign-in redirect, OAuth callback, session read/refresh, sign-out |
| `middleware.ts` | Protects routes and renews the session cookie in place |
| `app/layout.tsx` | Wraps the tree in `<DooorAuthProvider>` |
| `app/header.tsx` | `<SignedIn>` / `<SignedOut>` / `<SignInButton>` / `<UserButton>` |
| `app/dashboard/page.tsx` | Server-side `requireAuth()` + `getToken()` to call your own API |

## Run it

```bash
cp .env.example .env.local   # values come from the app's "Auth" tab in the dashboard
npm install
npm run dev
```

Then open http://localhost:3000 and click "Sign in".

`http://localhost:3000/api/dooor-auth/callback` must be registered as a redirect URI for the app. Apps created through the Dooor dashboard get their localhost callback registered automatically.

## The backend side

Any backend verifies the access token offline, without calling Dooor Auth:

```ts
import { requireDooorAuth } from "@dooor-ai/auth-node/express";

app.use(requireDooorAuth());              // issuer/audience from env
app.get("/me", (req, res) => res.json(req.dooor));
```

NestJS and Fastify have their own adapters - see the [`@dooor-ai/auth-node` README](../../packages/auth-node/README.md).
