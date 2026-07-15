import { DooorAuthError } from "@dooor-ai/auth-core";
import { verifyDooorAccessToken } from "./verify.js";
import type { DooorTokenPayload, VerifyDooorTokenOptions } from "./types.js";

/** Structural request shape accepted by the default bearer-token extractor. */
export interface HeaderBearerRequest {
  headers?: Record<string, string | string[] | undefined> | { get(name: string): string | null };
}

export interface CreateAuthGuardOptions extends VerifyDooorTokenOptions {
  /** Custom bearer-token extractor. Defaults to reading `Authorization: Bearer <token>`. */
  getToken?: (request: unknown) => string | undefined;
}

/**
 * Framework-agnostic guard: returns an async function that extracts the
 * bearer token from a request-like object, verifies it, and returns the
 * decoded claims (or throws `DooorAuthError`). Framework adapters like
 * `@dooor-ai/auth-node/express` wrap this into middleware conventions.
 */
export function createAuthGuard(options: CreateAuthGuardOptions = {}) {
  const getToken = options.getToken ?? defaultGetToken;

  return async function authGuard(request: unknown): Promise<DooorTokenPayload> {
    const token = getToken(request);
    if (!token) {
      throw new DooorAuthError("Missing bearer token", "missing_token");
    }
    return verifyDooorAccessToken(token, options);
  };
}

function defaultGetToken(request: unknown): string | undefined {
  const headers = (request as HeaderBearerRequest | undefined)?.headers;
  if (!headers) return undefined;

  const raw = typeof (headers as { get?: unknown }).get === "function"
    ? (headers as { get(name: string): string | null }).get("authorization")
    : (headers as Record<string, string | string[] | undefined>).authorization ??
      (headers as Record<string, string | string[] | undefined>)["Authorization"];

  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return undefined;

  const [scheme, value] = header.split(" ");
  if (!value || scheme?.toLowerCase() !== "bearer") return undefined;
  return value;
}
