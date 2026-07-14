# `@dooor-ai/auth-react`

React provider/hooks and Next.js App Router BFF helpers for Dooor Auth.

```tsx
import { DooorAuthProvider, SignInButton, SignedIn, SignedOut } from "@dooor-ai/auth-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DooorAuthProvider publishableKey={process.env.NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY!}>
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>{children}</SignedIn>
    </DooorAuthProvider>
  );
}
```

```ts
// app/api/dooor-auth/[...route]/route.ts
import { createDooorAuthHandler } from "@dooor-ai/auth-react/server";
export const { GET, POST } = createDooorAuthHandler();
```
