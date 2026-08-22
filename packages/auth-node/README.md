# @dooor-ai/auth-node

Offline verification of [Dooor Auth](https://api.os.dooor.ai) access tokens: fetches the issuer's public JWKS, caches keys by `kid` (5 min TTL, instant refetch on an unknown `kid`), and allowlists `RS256` only. No secret is ever shared with the Dooor platform.

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

For API bearer authentication, use `verifyDooorAccessToken` or one of the
middleware adapters. They reject signed ID tokens and prevent token
substitution:

```ts
import { verifyDooorAccessToken } from "@dooor-ai/auth-node";

const claims = await verifyDooorAccessToken(token, {
  audience: process.env.DOOOR_AUTH_APP_ID!,
});
```

`issuer` defaults to `DOOOR_AUTH_ISSUER` (falling back to `https://api.os.dooor.ai`), and `audience` defaults to `DOOOR_AUTH_APP_ID`. Both env vars are injected automatically into apps deployed on the Dooor OS runtime; nothing to configure by hand there.

## Express

```ts
import express from "express";
import { requireDooorAuth } from "@dooor-ai/auth-node/express";

const app = express();
app.use(requireDooorAuth()); // reads DOOOR_AUTH_ISSUER / DOOOR_AUTH_APP_ID from env
app.get("/me", (req, res) => res.json(req.dooor));
```

Pass `{ optional: true }` to let requests through without a valid token (`req.dooor` stays `undefined`) instead of responding `401`. `req.dooor` is typed for you - no cast needed.

Role checks are built in. A valid token that lacks the role gets a `403`, not a `401`:

```ts
app.get("/admin", requireDooorAuth({ roles: ["admin"] }), handler);
app.get("/billing", requireDooorAuth({ roles: ["admin", "billing"], requireAllRoles: true }), handler);
```

## NestJS

```ts
import { DooorAuthModule } from "@dooor-ai/auth-node/nest";

@Module({ imports: [DooorAuthModule.forRoot()] }) // issuer/audience from env
export class AppModule {}
```

```ts
import { CurrentUser, DooorAuthGuard, DooorRoles, Public } from "@dooor-ai/auth-node/nest";
import type { DooorTokenPayload } from "@dooor-ai/auth-node";

@UseGuards(DooorAuthGuard)
@Controller("reports")
export class ReportsController {
  @Get("me")
  me(@CurrentUser() user: DooorTokenPayload, @CurrentUser("org") orgId: string) {
    return { user, orgId };
  }

  @DooorRoles("admin")
  @Delete(":id")
  remove(@Param("id") id: string) {}

  @Public() // opts out when the guard is registered globally via APP_GUARD
  @Get("health")
  health() {
    return { ok: true };
  }
}
```

Register it globally instead of per-controller with the standard Nest provider:

```ts
providers: [{ provide: APP_GUARD, useClass: DooorAuthGuard }]
```

`@nestjs/common` and `@nestjs/core` are optional peer dependencies - the rest of the package works without them.

## Fastify

```ts
import { dooorAuthHook } from "@dooor-ai/auth-node/fastify";

app.addHook("preHandler", dooorAuthHook());
app.get("/me", (request) => request.dooor);

// Or scoped to a subtree, with a role requirement:
app.register(async (instance) => {
  instance.addHook("preHandler", dooorAuthHook({ roles: ["admin"] }));
  instance.get("/admin/stats", handler);
});
```

## Generic guard (any framework)

`createAuthGuard` accepts anything with a `headers` bag or a `Headers` instance, which covers Hono, Elysia, Koa, and any Fetch-based runtime:

```ts
import { createAuthGuard } from "@dooor-ai/auth-node";

const guard = createAuthGuard({ audience: process.env.DOOOR_AUTH_APP_ID! });

// Hono (or any framework exposing the raw Request):
app.use(async (c, next) => {
  c.set("dooor", await guard(c.req.raw));
  await next();
});
```

## Roles

`hasRoles` / `assertRoles` run authorization checks against already-verified claims. Roles are resolved per app at token issuance:

```ts
import { assertRoles, verifyDooorAccessToken } from "@dooor-ai/auth-node";

const claims = await verifyDooorAccessToken(token);
assertRoles(claims, ["admin"]);            // throws DooorAuthError("insufficient_role")
assertRoles(claims, ["a", "b"], { requireAll: true });
```

## Security notes

- Only `RS256` is accepted; `alg: none` and symmetric-key downgrade attempts are rejected before signature verification.
- `aud` must match the app's id exactly; a token minted for one app is rejected by another app's verifier.
- API guards require `token_use=access`; a signed ID token is rejected as a bearer token.
- Role checks are authorization on top of verification, never a replacement for it: `assertRoles` assumes the claims already came out of `verifyDooorAccessToken`.
- The JWKS cache refetches on TTL expiry (5 min) or immediately when a `kid` it hasn't seen is presented, so key rotation doesn't require a deploy or restart.

## License

MIT
