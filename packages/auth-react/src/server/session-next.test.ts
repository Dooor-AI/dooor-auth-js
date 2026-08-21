import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptCookiePayload } from "./cookie-crypto.js";
import type { SessionCookiePayload } from "./config.js";

const cookieSecret = "test-cookie-secret-with-at-least-32-characters";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("next/headers");
});

/** Loads a fresh copy of the module so the mocked `next/headers` is picked up. */
async function loadSession() {
  vi.resetModules();
  return import("./session.js");
}

describe("auth() via next/headers", () => {
  it("reads the session from the Next cookie store", async () => {
    const cookie = await encryptCookiePayload(cookieSecret, {
      accessToken: "at_live",
      expiresAt: Date.now() + 60_000,
      user: { id: "usr_1", email: "ada@example.com" },
    } satisfies SessionCookiePayload);

    vi.doMock("next/headers", () => ({
      cookies: () => ({ get: (name: string) => (name === "dooor_session" ? { value: cookie } : undefined) }),
    }));

    const { auth } = await loadSession();
    await expect(auth({ cookieSecret })).resolves.toMatchObject({ isSignedIn: true, userId: "usr_1" });
  });

  it("supports the async cookies() signature of Next 15+", async () => {
    const cookie = await encryptCookiePayload(cookieSecret, {
      accessToken: "at_live",
      expiresAt: Date.now() + 60_000,
      user: { id: "usr_2", email: "grace@example.com" },
    } satisfies SessionCookiePayload);

    vi.doMock("next/headers", () => ({
      cookies: async () => ({ get: () => ({ value: cookie }) }),
    }));

    const { auth } = await loadSession();
    await expect(auth({ cookieSecret })).resolves.toMatchObject({ userId: "usr_2" });
  });

  it("propagates Next's dynamic-usage bail-out instead of prerendering a signed-out page", async () => {
    // Next signals "this route reads cookies, so it cannot be static" by
    // throwing from cookies(). Swallowing it would cache a signed-out page and
    // serve it to signed-in users, so the error must escape auth().
    const bailout = Object.assign(new Error("Dynamic server usage: cookies"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });

    vi.doMock("next/headers", () => ({
      cookies: () => {
        throw bailout;
      },
    }));

    const { auth } = await loadSession();
    await expect(auth({ cookieSecret })).rejects.toBe(bailout);
  });

  it("reports signed out (without throwing) when next/headers is unavailable", async () => {
    vi.doMock("next/headers", () => {
      throw new Error("Cannot find module 'next/headers'");
    });

    const { auth } = await loadSession();
    await expect(auth({ cookieSecret })).resolves.toMatchObject({ isSignedIn: false });
  });
});
