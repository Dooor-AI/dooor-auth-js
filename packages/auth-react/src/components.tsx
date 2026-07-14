"use client";

import { useEffect, type ReactNode } from "react";
import { useDooorAuthContext } from "./context.js";

function buildSignInUrl(basePath: string, redirectUrl?: string): string {
  const target = new URL(`${basePath}/signin`, window.location.origin);
  target.searchParams.set("redirect_url", redirectUrl ?? window.location.pathname + window.location.search);
  return target.toString();
}

export interface SignedInProps {
  children: ReactNode;
}

/** Renders `children` once the session has loaded and the end-user is signed in. */
export function SignedIn({ children }: SignedInProps) {
  const { isLoaded, isSignedIn } = useDooorAuthContext();
  if (!isLoaded || !isSignedIn) return null;
  return <>{children}</>;
}

export interface SignedOutProps {
  children: ReactNode;
}

/** Renders `children` once the session has loaded and the end-user is signed out. */
export function SignedOut({ children }: SignedOutProps) {
  const { isLoaded, isSignedIn } = useDooorAuthContext();
  if (!isLoaded || isSignedIn) return null;
  return <>{children}</>;
}

export interface SignInButtonProps {
  children?: ReactNode;
  /** Path (or absolute URL) to send the user back to after signing in. Defaults to the current page. */
  redirectUrl?: string;
  basePath?: string;
  className?: string;
}

/** Redirects the browser to the hosted sign-in flow when clicked. */
export function SignInButton({ children, redirectUrl, basePath, className }: SignInButtonProps) {
  const ctx = useDooorAuthContext();
  const effectiveBasePath = basePath ?? ctx.basePath;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.location.href = buildSignInUrl(effectiveBasePath, redirectUrl);
      }}
    >
      {children ?? "Sign in"}
    </button>
  );
}

export interface SignInProps {
  redirectUrl?: string;
  basePath?: string;
}

/**
 * Redirect-mode `<SignIn/>`: mounts and immediately redirects the browser to
 * the hosted sign-in page. This is the only mode shipped in v1; an
 * `embedded` mode that renders the form inline is planned for a later
 * version (see PRD §6.7).
 */
export function SignIn({ redirectUrl, basePath }: SignInProps) {
  const ctx = useDooorAuthContext();
  const effectiveBasePath = basePath ?? ctx.basePath;

  useEffect(() => {
    window.location.href = buildSignInUrl(effectiveBasePath, redirectUrl);
  }, [effectiveBasePath, redirectUrl]);

  return null;
}

export interface UserButtonProps {
  className?: string;
}

/** Minimal avatar/initial button that signs the user out when clicked. Bring your own dropdown UI on top if you need one. */
export function UserButton({ className }: UserButtonProps) {
  const { user, signOut } = useDooorAuthContext();
  if (!user) return null;

  const initial = (user.name ?? user.email ?? "?").charAt(0).toUpperCase();

  return (
    <button type="button" className={className} title={user.email} onClick={() => void signOut()}>
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" width={24} height={24} style={{ borderRadius: "50%" }} />
      ) : (
        initial
      )}
    </button>
  );
}
