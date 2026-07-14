# @dooor-ai/auth-core

Framework-agnostic OIDC client helpers for [Dooor Auth](https://auth.dooor.ai): build the authorize URL, generate PKCE pairs, parse the callback, and exchange/refresh tokens. Zero framework dependencies, uses `fetch` and the Web Crypto API.

Most apps use `@dooor-ai/auth-react` or `@dooor-ai/auth-node` instead, which depend on this package internally. Use `auth-core` directly if you're integrating with a custom framework or writing your own SDK adapter.

## Install

```bash
npm i @dooor-ai/auth-core
```

## Usage

```ts
import { buildAuthorizeUrl, createPkcePair, generateState, exchangeCode } from "@dooor-ai/auth-core";

const pkce = await createPkcePair();
const state = generateState();

const authorizeUrl = buildAuthorizeUrl({
  publishableKey: process.env.NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY!,
  redirectUri: "https://my-app.example.com/api/dooor-auth/callback",
  state,
  codeChallenge: pkce.codeChallenge,
});

// redirect the browser to `authorizeUrl`, persist `pkce.codeVerifier` and `state`
// server-side (short-lived cookie), then on callback:

const tokens = await exchangeCode({
  publishableKey: process.env.NEXT_PUBLIC_DOOOR_AUTH_PUBLISHABLE_KEY!,
  redirectUri: "https://my-app.example.com/api/dooor-auth/callback",
  code, // from the callback query string
  codeVerifier: pkce.codeVerifier,
});
```

## API

- `buildAuthorizeUrl(options)` - builds the `/v1/idp/authorize` URL.
- `generateCodeVerifier()`, `generateCodeChallenge(verifier)`, `createPkcePair()` - PKCE (S256) helpers per RFC 7636.
- `generateState()` - opaque anti-CSRF `state` value.
- `parseCallback(input)` - extracts `code`/`state`/`error` from a URL, query string, or params object.
- `exchangeCode(options)` - trades an authorization code + `code_verifier` for a token set.
- `refreshToken(options)` - redeems a rotating refresh token for a new token set.
- `MemoryTokenStore` - in-memory `TokenStore` implementation (not persisted across reloads).

Default issuer is `https://auth.dooor.ai`; pass `issuer` to any function to target a different environment.

## License

MIT
