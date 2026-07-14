# Dooor Auth JS

Public SDKs for [Dooor Auth](https://auth.dooor.ai) — the identity layer of the Dooor OS platform.

| Package | Purpose |
|---------|---------|
| [`@dooor-ai/auth-core`](./packages/auth-core) | Framework-agnostic OIDC client (PKCE, authorize, token, refresh) |
| [`@dooor-ai/auth-node`](./packages/auth-node) | Offline JWKS verification + Express middleware |
| [`@dooor-ai/auth-react`](./packages/auth-react) | React provider/hooks + Next.js BFF route handlers |

## Quickstart (Next.js)

```bash
npm i @dooor-ai/auth-react @dooor-ai/auth-node
```

Env vars are injected by Dooor OS when Auth is enabled on the app:

```bash
DOOOR_AUTH_ISSUER=https://auth.dooor.ai
DOOOR_AUTH_APP_ID=app_…
DOOOR_AUTH_PUBLISHABLE_KEY=dor_pk_…
DOOOR_AUTH_COOKIE_SECRET=…
NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY=dor_pk_…
NEXT_PUBLIC_DOOOR_AUTH_ISSUER=https://auth.dooor.ai
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
// app/api/dooor-auth/[...route]/route.ts
import { createDooorAuthHandler } from "@dooor-ai/auth-react/server";
export const { GET, POST } = createDooorAuthHandler();
```

```ts
// backend (Express)
import { requireDooorAuth } from "@dooor-ai/auth-node/express";

app.use(requireDooorAuth());
app.get("/me", (req, res) => res.json(req.dooor));
```

## Develop

```bash
pnpm install
pnpm test
pnpm build
```

## License

MIT
