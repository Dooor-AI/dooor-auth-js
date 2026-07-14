import { DooorAuthError } from "./types.js";

/** POSTs `application/x-www-form-urlencoded` form data and parses the JSON response. Throws `DooorAuthError` on non-2xx or OAuth error bodies. */
export async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new DooorAuthError(`Unexpected non-JSON response from ${url}`, "invalid_response");
  }

  if (!response.ok) {
    const errorBody = json as { error?: string; error_description?: string };
    throw new DooorAuthError(
      errorBody.error_description ?? `Request to ${url} failed with status ${response.status}`,
      errorBody.error ?? "request_failed",
      json,
    );
  }

  return json as T;
}
