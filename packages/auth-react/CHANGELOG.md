# @dooor-ai/auth-react

## 0.2.0

### Minor Changes

- 39659cd: Make `https://api.os.dooor.ai` the permanent default issuer and validate Next.js middleware session cookies cryptographically with Web Crypto before protected routes are released.

### Patch Changes

- Updated dependencies [39659cd]
  - @dooor-ai/auth-core@0.2.0
  - @dooor-ai/auth-node@0.2.0

## 0.1.4

### Patch Changes

- 62747ea: Reject ID token substitution in API bearer guards and require strong BFF cookie secrets.
- Updated dependencies [62747ea]
  - @dooor-ai/auth-node@0.1.3

## 0.1.3

### Patch Changes

- Revoke central refresh sessions on BFF sign-out and restrict post-login redirects to the mini-app origin.
- Updated dependencies
  - @dooor-ai/auth-core@0.1.3
