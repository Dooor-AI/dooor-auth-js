import { dooorAuthMiddleware } from "@dooor-ai/auth-react/server";

// Protects everything except the routes listed here. It also renews an expired
// session cookie in place, so server components downstream always see a fresh
// access token.
export default dooorAuthMiddleware({
  publicRoutes: ["/", "/sign-in(.*)"],
});

export const config = {
  // Skip Next internals and static files; run on everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp)$).*)"],
};
