// The BFF. One file, zero config: it owns the OAuth dance, the session cookie,
// refresh, and sign-out. Everything runs server-side; no token ever lands in
// localStorage.
import { createDooorAuthHandler } from "@dooor-ai/auth-react/server";

export const { GET, POST } = createDooorAuthHandler();
