# @dooor-ai/auth-core

## 0.2.0

### Minor Changes

- 39659cd: Make `https://api.os.dooor.ai` the permanent default issuer and validate Next.js middleware session cookies cryptographically with Web Crypto before protected routes are released.

## 0.1.3

### Patch Changes

- Revoke central refresh sessions on BFF sign-out and restrict post-login redirects to the mini-app origin.
