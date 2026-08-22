"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  /** Same-origin path to send the user back to after signing in. Defaults to the current page. */
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

export interface UserButtonMenuItem {
  label: string;
  /** Same-origin URL to navigate to, or a click handler. */
  href?: string;
  onClick?: () => void;
}

export interface UserButtonProps {
  className?: string;
  /** Class applied to the dropdown panel, for styling with your own CSS. */
  menuClassName?: string;
  /** Show the user's name next to the avatar. */
  showName?: boolean;
  /** Extra entries rendered above "Sign out" (e.g. a link to your own profile page). */
  menuItems?: UserButtonMenuItem[];
  /** Where to send the browser after signing out. Defaults to reloading the current page. */
  afterSignOutUrl?: string;
  /** Renders the bare avatar button without a dropdown (the pre-0.3 behaviour: click signs out immediately). */
  disableMenu?: boolean;
}

const AVATAR_SIZE = 32;

const triggerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "none",
  border: "none",
  padding: 2,
  cursor: "pointer",
  font: "inherit",
};

const avatarStyle: CSSProperties = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#e5e7eb",
  color: "#111827",
  fontSize: 14,
  fontWeight: 600,
  overflow: "hidden",
  flexShrink: 0,
};

const menuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  minWidth: 200,
  padding: 4,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  zIndex: 50,
};

const menuItemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  background: "none",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
  textDecoration: "none",
};

/**
 * Avatar button with a dropdown showing the signed-in identity, any extra
 * `menuItems` you pass, and "Sign out". Styles are inline and deliberately
 * plain - pass `className`/`menuClassName` and restyle, or build your own
 * control on top of `useUser()` and `useAuth()`.
 */
export function UserButton({
  className,
  menuClassName,
  showName = false,
  menuItems = [],
  afterSignOutUrl,
  disableMenu = false,
}: UserButtonProps) {
  const { user, signOut } = useDooorAuthContext();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Close on outside click and on Escape, so the menu never traps focus.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const handleSignOut = useCallback(async () => {
    setIsOpen(false);
    await signOut();
    window.location.href = afterSignOutUrl ?? window.location.href;
  }, [signOut, afterSignOutUrl]);

  if (!user) return null;

  const label = user.name ?? user.email ?? "Account";
  const initial = label.charAt(0).toUpperCase();

  const avatar = (
    <span style={avatarStyle} aria-hidden="true">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" width={AVATAR_SIZE} height={AVATAR_SIZE} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initial
      )}
    </span>
  );

  if (disableMenu) {
    return (
      <button type="button" className={className} style={triggerStyle} title={user.email} onClick={() => void handleSignOut()}>
        {avatar}
        {showName ? <span>{label}</span> : null}
      </button>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={className}
        style={triggerStyle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`Account menu for ${label}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        {avatar}
        {showName ? <span>{label}</span> : null}
      </button>

      {isOpen ? (
        <div id={menuId} role="menu" className={menuClassName} style={menuStyle}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", marginBottom: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name ?? user.email}</div>
            {user.name && user.email ? <div style={{ fontSize: 12, color: "#6b7280" }}>{user.email}</div> : null}
          </div>

          {menuItems.map((item) =>
            item.href ? (
              <a key={item.label} role="menuitem" href={item.href} style={menuItemStyle} onClick={() => setIsOpen(false)}>
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                style={menuItemStyle}
                onClick={() => {
                  setIsOpen(false);
                  item.onClick?.();
                }}
              >
                {item.label}
              </button>
            ),
          )}

          <button type="button" role="menuitem" style={menuItemStyle} onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
