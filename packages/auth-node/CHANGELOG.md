# @dooor-ai/auth-node

## 0.3.0

### Minor Changes

- ee11e9b: Make the SDKs usable end to end in a real app.

  **Fixes**

  - Request `offline_access` by default, so the IdP issues a refresh token and the session outlives the 5-minute access token.
  - Serve a real error page for failed sign-ins. The callback used to redirect to a route that did not exist, so a denied consent or a `state` mismatch ended on a bare 404. The reason is sanitized before being reflected, and `errorUrl` / `DOOOR_AUTH_ERROR_URL` point it at your own page.
  - Honour `basePath` in the callback's error redirect and in `dooorAuthMiddleware`, which previously hard-coded `/api/dooor-auth` and looped the sign-in redirect for any app mounted elsewhere.
  - Reject sign-out over GET (405). A cross-site `<img src=".../signout">` could previously end a session.
  - Fix the `RouteHandler` type, which failed Next.js 15's route validator: `next build` errored on the BFF route in every app using the SDK.
  - Seal the session and transaction cookies with Web Crypto instead of `node:crypto`. The `/server` bundle pulled a Node builtin into the Edge middleware, which Next.js warns about on every build and which is unsupported in the Edge runtime. The wire format is unchanged, so existing cookies keep working.
  - Let Next's dynamic-usage bail-out escape the session helpers. Catching it around `cookies()` would have prerendered protected pages as signed out and served that cached HTML to signed-in users.

  **New**

  - `auth()`, `currentUser()`, `getToken()` and `requireAuth()` in `@dooor-ai/auth-react/server`, for Server Components, Server Actions and Route Handlers.
  - `dooorAuthMiddleware` renews an expired session cookie in place (Web Crypto AES-GCM, Edge-compatible) instead of bouncing the user through sign-in; a refusal from the IdP ends the session.
  - NestJS adapter: `DooorAuthModule`, `DooorAuthGuard`, `@CurrentUser()`, `@DooorRoles()`, `@Public()`.
  - Fastify adapter: `dooorAuthHook`.
  - Role checks: `hasRoles` / `assertRoles`, plus `roles` options on the Express and Fastify adapters (403 rather than 401 for an authenticated principal missing the role).
  - `req.dooor` is typed for Express consumers via declaration merging.
  - `<UserButton/>` renders a real dropdown (identity, custom `menuItems`, sign out) with outside-click and Escape handling.

### Patch Changes

- Updated dependencies [ee11e9b]
  - @dooor-ai/auth-core@0.3.0

## 0.2.0

### Minor Changes

- 39659cd: Make `https://api.os.dooor.ai` the permanent default issuer and validate Next.js middleware session cookies cryptographically with Web Crypto before protected routes are released.

### Patch Changes

- Updated dependencies [39659cd]
  - @dooor-ai/auth-core@0.2.0

## 0.1.3

### Patch Changes

- 62747ea: Reject ID token substitution in API bearer guards and require strong BFF cookie secrets.
