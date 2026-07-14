import { describe, expect, it } from "vitest";
import { createDooorAuthHandler } from "./server";

describe("createDooorAuthHandler", () => {
  it("exports GET and POST handlers", () => {
    const handlers = createDooorAuthHandler();
    expect(typeof handlers.GET).toBe("function");
    expect(typeof handlers.POST).toBe("function");
  });
});
