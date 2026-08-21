// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DooorAuthProvider } from "./context.js";
import { SignedIn, SignedOut, SignInButton, UserButton } from "./components.js";
import { useAuth, useUser } from "./hooks.js";

const SESSION = {
  isSignedIn: true,
  user: { id: "usr_1", email: "ada@example.com", name: "Ada Lovelace", roles: ["admin"] },
  accessToken: "at_live",
  expiresAt: Date.now() + 5 * 60_000,
};

const SIGNED_OUT = { isSignedIn: false, user: null, accessToken: null, expiresAt: null };

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = handler(String(input), init);
    return { ok: true, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function wrap(children: React.ReactNode) {
  return <DooorAuthProvider publishableKey="dor_pk_test">{children}</DooorAuthProvider>;
}

beforeEach(() => {
  vi.stubGlobal("location", { ...window.location, href: "https://app.test/reports", origin: "https://app.test", pathname: "/reports", search: "" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DooorAuthProvider", () => {
  it("loads the session from the BFF and exposes it through useUser", async () => {
    mockFetch(() => SESSION);

    function Profile() {
      const { isLoaded, user } = useUser();
      return <div>{isLoaded ? (user?.email ?? "none") : "loading"}</div>;
    }

    render(wrap(<Profile />));
    expect(screen.getByText("loading")).toBeDefined();
    await waitFor(() => expect(screen.getByText("ada@example.com")).toBeDefined());
  });

  it("renders SignedIn/SignedOut according to session state", async () => {
    mockFetch(() => SIGNED_OUT);

    render(
      wrap(
        <>
          <SignedIn>
            <span>inside</span>
          </SignedIn>
          <SignedOut>
            <span>outside</span>
          </SignedOut>
        </>,
      ),
    );

    await waitFor(() => expect(screen.getByText("outside")).toBeDefined());
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("serves a still-fresh access token from state without calling the BFF again", async () => {
    const fetchMock = mockFetch(() => SESSION);

    let getToken!: () => Promise<string | null>;
    function Consumer() {
      getToken = useAuth().getToken;
      return null;
    }

    render(wrap(<Consumer />));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(await getToken()).toBe("at_live");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches through the BFF once the cached token falls inside the refresh skew", async () => {
    // Expires in 5s, i.e. inside the provider's 15s skew: must be treated as stale.
    let current = { ...SESSION, accessToken: "at_stale", expiresAt: Date.now() + 5_000 };
    const fetchMock = mockFetch(() => current);

    let getToken!: () => Promise<string | null>;
    function Consumer() {
      getToken = useAuth().getToken;
      return null;
    }

    render(wrap(<Consumer />));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    current = { ...SESSION, accessToken: "at_rotated", expiresAt: Date.now() + 5 * 60_000 };

    let token: string | null = null;
    await act(async () => {
      token = await getToken();
    });

    expect(token).toBe("at_rotated");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent session fetches into a single request", async () => {
    const current = { ...SESSION, accessToken: "at_stale", expiresAt: Date.now() + 5_000 };
    const fetchMock = mockFetch(() => current);

    let getToken!: () => Promise<string | null>;
    function Consumer() {
      getToken = useAuth().getToken;
      return null;
    }

    render(wrap(<Consumer />));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await Promise.all([getToken(), getToken(), getToken()]);
    });

    // Three stale reads, one network call: the in-flight request is shared.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a helpful error when hooks are used outside the provider", () => {
    function Orphan() {
      useUser();
      return null;
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/within a <DooorAuthProvider>/);
    consoleError.mockRestore();
  });
});

describe("SignInButton", () => {
  it("sends the browser to the BFF sign-in route with the current path as redirect_url", async () => {
    mockFetch(() => SIGNED_OUT);
    render(wrap(<SignInButton />));

    await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));

    expect(window.location.href).toContain("/api/dooor-auth/signin");
    expect(window.location.href).toContain("redirect_url=%2Freports");
  });
});

describe("UserButton", () => {
  it("opens a menu, renders custom items, and signs out", async () => {
    const fetchMock = mockFetch((url) => (url.endsWith("/signout") ? { signedOut: true } : SESSION));
    const onSettings = vi.fn();

    render(wrap(<UserButton showName menuItems={[{ label: "Settings", onClick: onSettings }]} afterSignOutUrl="/bye" />));

    const trigger = await screen.findByRole("button", { name: /Account menu for Ada Lovelace/ });
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeDefined();
    expect(screen.getByText("ada@example.com")).toBeDefined();

    await userEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(onSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/dooor-auth/signout", expect.objectContaining({ method: "POST" })),
    );
    await waitFor(() => expect(window.location.href).toBe("/bye"));
  });

  it("closes the menu on Escape", async () => {
    mockFetch(() => SESSION);
    render(wrap(<UserButton />));

    await userEvent.click(await screen.findByRole("button", { name: /Account menu/ }));
    expect(screen.getByRole("menu")).toBeDefined();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("renders nothing while signed out", async () => {
    mockFetch(() => SIGNED_OUT);
    const { container } = render(wrap(<UserButton />));
    await waitFor(() => expect(container.querySelector("button")).toBeNull());
  });
});
