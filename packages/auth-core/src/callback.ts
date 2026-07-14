import type { ParsedCallback } from "./types.js";

/**
 * Parses the redirect back from the IdP (`?code=...&state=...` or
 * `?error=...&error_description=...`). Accepts a full URL, a query string,
 * or a `URLSearchParams`/`Record` of params so it works in both browser
 * (`window.location.href`) and server (Next.js `searchParams`) contexts.
 */
export function parseCallback(
  input: string | URL | URLSearchParams | Record<string, string | string[] | undefined>,
): ParsedCallback {
  const params = toSearchParams(input);

  const result: ParsedCallback = {};
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  if (code) result.code = code;
  if (state) result.state = state;
  if (error) result.error = error;
  if (errorDescription) result.errorDescription = errorDescription;

  return result;
}

function toSearchParams(
  input: string | URL | URLSearchParams | Record<string, string | string[] | undefined>,
): URLSearchParams {
  if (input instanceof URLSearchParams) return input;

  if (input instanceof URL) return input.searchParams;

  if (typeof input === "string") {
    if (input.includes("://")) return new URL(input).searchParams;
    return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value[0] !== undefined) params.set(key, value[0]);
    } else {
      params.set(key, value);
    }
  }
  return params;
}
