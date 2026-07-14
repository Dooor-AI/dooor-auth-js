# @dooor-ai/auth-node

Offline verification of [Dooor Auth](https://auth.dooor.ai) access tokens: fetches the issuer's public JWKS, caches keys by `kid` (5 min TTL, instant refetch on an unknown `kid`), and allowlists `RS256` only. No secret is ever shared with the Dooor platform.

## Install

```bash
npm i @dooor-ai/auth-node
```

## Generic usage

```ts
import { verifyDooorToken } from "@dooor-ai/auth-node";

const claims = await verifyDooorToken(token, { audience: process.env.DOOOR_AUTH_APP_ID! });
// { sub, aud, sid, realm, app_user, org, email, roles, iat, exp, jti }
```

`issuer` defaults to `DOOOR_AUTH_ISSUER` (falling back to `https://auth.dooor.ai`), and `audience` defaults to `DOOOR_AUTH_APP_ID`. Both env vars are injected automatically into apps deployed on the Dooor OS runtime; nothing to configure by hand there.

## Express

```ts
import express from "express";
import { requireDooorAuth } from "@dooor-ai/auth-node/express";

const app = express();
app.use(requireDooorAuth()); // reads DOOOR_AUTH_ISSUER / DOOOR_AUTH_APP_ID from env
app.get("/me", (req, res) => res.json(req.dooor));
```

Pass `{ optional: true }` to let requests through without a valid token (`req.dooor` stays `undefined`) instead of responding `401`.

## Generic guard (any framework)

```ts
import { createAuthGuard } from "@dooor-ai/auth-node";

const guard = createAuthGuard({ audience: process.env.DOOOR_AUTH_APP_ID! });

// Fastify, Nest, or any request-like object with a `headers` bag/Headers instance:
fastify.addHook("preHandler", async (request) => {
  request.dooor = await guard(request);
});
```

## Security notes

- Only `RS256` is accepted; `alg: none` and symmetric-key downgrade attempts are rejected before signature verification.
- `aud` must match the app's id exactly; a token minted for one app is rejected by another app's verifier.
- The JWKS cache refetches on TTL expiry (5 min) or immediately when a `kid` it hasn't seen is presented, so key rotation doesn't require a deploy or restart.

## License

MIT
