"use client";

import type { DooorUser } from "@dooor-ai/auth-core";
import { useDooorAuthContext } from "./context.js";

export interface UseAuthResult {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  /** Returns a fresh access token (verify server-side with `@dooor-ai/auth-node`); transparently refreshes when near expiry. */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

/** Auth state without the full user profile. Prefer `useUser()` when you need `email`/`name`/`image`. */
export function useAuth(): UseAuthResult {
  const ctx = useDooorAuthContext();
  return {
    isLoaded: ctx.isLoaded,
    isSignedIn: ctx.isSignedIn,
    userId: ctx.user?.id ?? null,
    getToken: ctx.getToken,
    signOut: ctx.signOut,
  };
}

export interface UseUserResult {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: DooorUser | null;
}

export function useUser(): UseUserResult {
  const ctx = useDooorAuthContext();
  return { isLoaded: ctx.isLoaded, isSignedIn: ctx.isSignedIn, user: ctx.user };
}
