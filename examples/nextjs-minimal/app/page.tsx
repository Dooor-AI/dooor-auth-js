// A public page (listed in `publicRoutes`) that still reads the session on the
// server: `auth()` works in any Server Component.
import Link from "next/link";
import { auth } from "@dooor-ai/auth-react/server";

export default async function HomePage() {
  const { isSignedIn, user } = await auth();

  return (
    <>
      <h1>Dooor Auth, end to end</h1>
      <p>
        {isSignedIn
          ? `Signed in as ${user?.name ?? user?.email}.`
          : "You are signed out. Use the button in the header to sign in."}
      </p>
      <p>
        <Link href="/dashboard">Go to the protected dashboard →</Link>
      </p>
    </>
  );
}
