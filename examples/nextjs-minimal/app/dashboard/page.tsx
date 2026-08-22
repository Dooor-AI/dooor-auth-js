// A protected page: the middleware already bounced signed-out visitors to
// sign-in before this renders, so `requireAuth()` is a safety net, not the
// primary gate.
import { getToken, requireAuth } from "@dooor-ai/auth-react/server";

async function callBackend(): Promise<string> {
  const token = await getToken();
  if (!token) return "No access token available (session expired between requests).";

  // Your own backend verifies this token offline with @dooor-ai/auth-node.
  const apiUrl = process.env.EXAMPLE_API_URL;
  if (!apiUrl) return `Ready to call your API with a ${token.length}-char bearer token.`;

  const response = await fetch(`${apiUrl}/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return response.ok ? JSON.stringify(await response.json(), null, 2) : `API replied ${response.status}`;
}

export default async function DashboardPage() {
  const { user, roles, orgId, expiresAt } = await requireAuth();
  const backendResult = await callBackend();

  return (
    <>
      <h1>Dashboard</h1>
      <dl>
        <dt>User</dt>
        <dd>{user?.name ?? user?.email}</dd>
        <dt>Workspace</dt>
        <dd>{orgId ?? "-"}</dd>
        <dt>Roles</dt>
        <dd>{roles.length ? roles.join(", ") : "none"}</dd>
        <dt>Access token expires at</dt>
        <dd>{expiresAt ? new Date(expiresAt).toISOString() : "-"}</dd>
      </dl>

      <h2>Calling your backend</h2>
      <pre style={{ background: "#f9fafb", padding: "1rem", borderRadius: 8, overflowX: "auto" }}>{backendResult}</pre>
    </>
  );
}
