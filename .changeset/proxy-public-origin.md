---
"@dooor-ai/auth-react": patch
---

Resolve the public origin behind a reverse proxy.

The BFF handler and the middleware derived every browser-facing URL — the
OAuth `redirect_uri`, the sign-in redirect, the error page — from
`new URL(request.url).origin`, which behind a proxy is the container's
internal address (`https://localhost:3000`). The IdP then correctly
rejected the authorize call with "redirect_uri is not on this app's
allowlist", so no app deployed behind an ingress could complete sign-in.

Both now resolve the origin the browser actually used: an explicit
`appUrl` option (or `DOOOR_AUTH_APP_URL`, which the Dooor OS runtime
injects) wins; otherwise `x-forwarded-host`/`x-forwarded-proto`; then the
`Host` header when it is not a loopback address; and only then the request
URL. Plain local development keeps working with zero configuration.
