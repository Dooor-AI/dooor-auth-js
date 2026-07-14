"use client";

import type { DooorUser } from "@dooor-ai/auth-core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface DooorSessionResponse {
  isSignedIn: boolean;
  user: DooorUser | null;
  accessToken: string | null;
  expiresAt: number | null;
}

export interface DooorAuthContextValue extends DooorSessionResponse {
  isLoaded: boolean;
  publishableKey: string;
  basePath: string;
  /** Returns a fresh access token, transparently refreshing via the BFF session endpoint when the cached one is near expiry. */
  getToken: () => Promise<string | null>;
  /** Re-fetches the session from the BFF (useful after an external event like a tab regaining focus). */
  refresh: () => Promise<void>;
  /** Clears the local session and the server-side BFF cookie. */
  signOut: () => Promise<void>;
}

const DooorAuthContext = createContext<DooorAuthContextValue | undefined>(undefined);

const EMPTY_SESSION: DooorSessionResponse = { isSignedIn: false, user: null, accessToken: null, expiresAt: null };

/** Safety margin so `getToken()` proactively refreshes slightly before the actual expiry. */
const REFRESH_SKEW_MS = 15_000;

export interface DooorAuthProviderProps {
  /** Publishable key of the AuthInstance (`dor_pk_...`). Typically `process.env.NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY`. */
  publishableKey: string;
  /** Dooor Auth issuer, only needed if you're overriding the default (e.g. self-hosted or a non-prod environment). */
  issuer?: string;
  /** Base path of the BFF route handlers mounted via `createDooorAuthHandler()`. Defaults to `/api/dooor-auth`. */
  basePath?: string;
  children: ReactNode;
}

export function DooorAuthProvider({
  publishableKey,
  basePath = "/api/dooor-auth",
  children,
}: DooorAuthProviderProps): JSX.Element {
  const [isLoaded, setIsLoaded] = useState(false);
  const [session, setSession] = useState<DooorSessionResponse>(EMPTY_SESSION);
  const inflightRef = useRef<Promise<DooorSessionResponse> | null>(null);

  const fetchSession = useCallback(async (): Promise<DooorSessionResponse> => {
    if (inflightRef.current) return inflightRef.current;

    const request = (async (): Promise<DooorSessionResponse> => {
      try {
        const response = await fetch(`${basePath}/session`, { credentials: "include" });
        if (!response.ok) return EMPTY_SESSION;
        return (await response.json()) as DooorSessionResponse;
      } catch {
        return EMPTY_SESSION;
      }
    })();

    inflightRef.current = request;
    try {
      return await request;
    } finally {
      inflightRef.current = null;
    }
  }, [basePath]);

  const refresh = useCallback(async (): Promise<void> => {
    const next = await fetchSession();
    setSession(next);
    setIsLoaded(true);
  }, [fetchSession]);

  useEffect(() => {
    void refresh();
    // Only re-runs if `basePath` changes (rare); `refresh` is stable enough for a mount-time fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (session.accessToken && session.expiresAt && session.expiresAt - REFRESH_SKEW_MS > Date.now()) {
      return session.accessToken;
    }
    const next = await fetchSession();
    setSession(next);
    return next.accessToken;
  }, [session, fetchSession]);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await fetch(`${basePath}/signout`, { method: "POST", credentials: "include" });
    } finally {
      setSession(EMPTY_SESSION);
    }
  }, [basePath]);

  const value = useMemo<DooorAuthContextValue>(
    () => ({ ...session, isLoaded, publishableKey, basePath, getToken, refresh, signOut }),
    [session, isLoaded, publishableKey, basePath, getToken, refresh, signOut],
  );

  return <DooorAuthContext.Provider value={value}>{children}</DooorAuthContext.Provider>;
}

export function useDooorAuthContext(): DooorAuthContextValue {
  const ctx = useContext(DooorAuthContext);
  if (!ctx) {
    throw new Error("Dooor Auth hooks and components must be used within a <DooorAuthProvider>.");
  }
  return ctx;
}
