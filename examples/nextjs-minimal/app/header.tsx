"use client";

import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@dooor-ai/auth-react";

export function Header() {
  const { user } = useUser();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <strong>Example app</strong>

      <SignedOut>
        <SignInButton />
      </SignedOut>

      <SignedIn>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>{user?.email}</span>
          <UserButton menuItems={[{ label: "Dashboard", href: "/dashboard" }]} afterSignOutUrl="/" />
        </span>
      </SignedIn>
    </header>
  );
}
