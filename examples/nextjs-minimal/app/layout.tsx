import type { ReactNode } from "react";
import { DooorAuthProvider } from "@dooor-ai/auth-react";
import { Header } from "./header";

export const metadata = { title: "Dooor Auth example" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <DooorAuthProvider publishableKey={process.env.NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY!}>
          <Header />
          <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>{children}</main>
        </DooorAuthProvider>
      </body>
    </html>
  );
}
