"use client";

import * as React from "react";
import {
  buildAuthorizeUrl,
  createPkcePair,
  generateState,
  MemoryTokenStore,
  type DooorTokenSet,
  type DooorUser,
} from "@dooor-ai/auth-core";

export interface DooorAuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: DooorUser | null;
  getToken: () => Promise<string | null>;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const DooorAuthContext = React.createContext<DooorAuthContextValue | null>(null);

export interface DooorAuthProviderProps {
  publishableKey: string;
  issuer?: string;
  children: React.ReactNode;
}

export function DooorAuthProvider({
  publishableKey,
  issuer,
  children,
}: DooorAuthProviderProps) {
  const store = React.useMemo(() => new MemoryTokenStore(), []);
  const [tokens, setTokens] = React.useState<DooorTokenSet | null>(null);
  const [user, setUser] = React.useState<DooorUser | null>(null);
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dooor-auth/session", {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            accessToken?: string;
            user?: DooorUser;
          };
          if (data.accessToken) {
            const set: DooorTokenSet = {
              accessToken: data.accessToken,
              tokenType: "Bearer",
              expiresIn: 240,
              expiresAt: Date.now() + 4 * 60 * 1000,
            };
            store.set(set);
            setTokens(set);
            setUser(data.user ?? null);
          }
        }
      } catch {
        // session endpoint may not exist yet during setup
      } finally {
        setIsLoaded(true);
      }
    })();
  }, [store]);

  const value = React.useMemo<DooorAuthContextValue>(
    () => ({
      isLoaded,
      isSignedIn: Boolean(tokens?.accessToken),
      user,
      getToken: async () => {
        const current = store.get();
        if (current?.accessToken && current.expiresAt > Date.now() + 30_000) {
          return current.accessToken;
        }
        const res = await fetch("/api/dooor-auth/session", {
          credentials: "include",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          accessToken?: string;
          user?: DooorUser;
        };
        if (!data.accessToken) return null;
        const set: DooorTokenSet = {
          accessToken: data.accessToken,
          tokenType: "Bearer",
          expiresIn: 240,
          expiresAt: Date.now() + 4 * 60 * 1000,
        };
        store.set(set);
        setTokens(set);
        setUser(data.user ?? null);
        return set.accessToken;
      },
      signIn: () => {
        void (async () => {
          const pkce = await createPkcePair();
          const state = generateState();
          sessionStorage.setItem(
            "dooor_auth_pkce",
            JSON.stringify({ ...pkce, state }),
          );
          document.cookie = `dooor_pkce_verifier=${encodeURIComponent(pkce.codeVerifier)}; Path=/; SameSite=Lax; Max-Age=600`;
          const url = buildAuthorizeUrl({
            publishableKey,
            issuer,
            redirectUri: `${window.location.origin}/api/dooor-auth/callback`,
            codeChallenge: pkce.codeChallenge,
            state,
          });
          window.location.assign(url);
        })();
      },
      signOut: async () => {
        await fetch("/api/dooor-auth/sign-out", {
          method: "POST",
          credentials: "include",
        }).catch(() => undefined);
        store.clear();
        setTokens(null);
        setUser(null);
      },
    }),
    [isLoaded, tokens, user, store, publishableKey, issuer],
  );

  return (
    <DooorAuthContext.Provider value={value}>{children}</DooorAuthContext.Provider>
  );
}

export function useAuth(): DooorAuthContextValue {
  const ctx = React.useContext(DooorAuthContext);
  if (!ctx) throw new Error("useAuth must be used within DooorAuthProvider");
  return ctx;
}

export function useUser() {
  const { user, isLoaded, isSignedIn } = useAuth();
  return { user, isLoaded, isSignedIn };
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || isSignedIn) return null;
  return <>{children}</>;
}

export function SignInButton({
  children = "Sign in",
}: {
  children?: React.ReactNode;
}) {
  const { signIn } = useAuth();
  return (
    <button type="button" onClick={signIn}>
      {children}
    </button>
  );
}

export function UserButton() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <button type="button" onClick={() => void signOut()} title={user.email}>
      {user.name ?? user.email ?? "Account"}
    </button>
  );
}

/** Redirect-mode SignIn (default). Embedded mode arrives in a later release. */
export function SignIn() {
  const { signIn, isSignedIn } = useAuth();
  React.useEffect(() => {
    if (!isSignedIn) signIn();
  }, [isSignedIn, signIn]);
  return null;
}
