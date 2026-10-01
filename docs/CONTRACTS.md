# Shared implementation contracts

## Module boundaries

`apps/web` owns the product interface and thin API bridge. `packages/platform` owns server-side business operations; `packages/db`, `auth`, `billing`, `email` and `shared` provide focused persistence, provider and data contracts. Tests and local startup tooling are kept in `tests` and `scripts`. Public UI and documentation use English.

## Server bridge

The platform exports `handleRequest(request: Request): Promise<Response>` from packages/platform/src/http.ts. The application exposes it from apps/web/app/api/[...path]/route.ts as GET/POST/PATCH/DELETE. Node runtime only, dynamic responses, no caching. Better Auth routes are handled by the same dispatcher under /api/auth/*. DB initialization is automatic and idempotent.

The platform exports `createPlatform(options?)` from packages/platform/src/index.ts for tests. Options can inject a fresh in-memory PGlite database, clock, demo flag, auth settings and mock webhook secret. Expose documented testable service methods or a bound handleRequest. Keep service changes compatible with the shared request and response contracts.

## Browser endpoints

- GET /api/health: readiness.
- POST /api/demo/start: creates isolated sandbox and HttpOnly session cookie. Return `{ok:true}`; browser enters /app/overview.
- GET /api/bootstrap?organizationId=...: `AppState` from packages/shared/src/types.ts, always membership-checked on server.
- POST /api/actions: `{action, organizationId?, ...fields}`; response `{ok:true, ...result}`. Mutations validate Origin, JSON body bounds and Zod input. Typed error `{error:{code,message,field?}}` with meaningful 4xx status. Frontend refreshes bootstrap after mutations.
- GET /api/v1/projects: Bearer API key, key-derived tenant. Optional organizationId must match key tenant. Appropriate scopes and rate/usage tracking.
- POST /api/billing/webhook: signature-verified raw-body provider events, event ID deduplication in a transaction.
- GET /api/platform: strict platform admin authorization in normal mode; demo preview only its own sandbox and clearly labeled. No other visitor/user secrets.
- /api/auth/*: real Better Auth email/password, optional configured GitHub/Google providers. Frontend sign-in/register paths use real endpoint contracts; demo is separate and credential-free.

## Action names and payloads

`demo.role {role}`, `demo.reset {}`, `session.logout {}`;
`organization.create {name,slug}`, `organization.update {name,slug}`, `organization.delete {confirmation:name}`, `organization.leave {}`;
`project.create {name,description,status}`, `project.update {id,name,description,status}` (archival is status=ARCHIVED);
`member.role {id,role}`, `member.remove {id}`;
`invitation.create {email,role}`, `invitation.revoke {id}`, `invitation.accept {organizationId,token}`, optional `demo.invitation.accept {id}` for safely opening an outbox invitation as a synthetic matching recipient in the current sandbox only;
`billing.plan {plan}`, `billing.cancel {}`, `billing.reactivate {}`, `billing.simulate {status}` (simulation demo-only);
`key.create {name,scopes}`, returns `{ok:true,key:string}` only once; `key.revoke {id}`;
`account.update {name,theme}`. Email changes require verification through Better Auth, never a direct unverified overwrite.

Role and plan enum values are uppercase. Dates serialize as ISO strings. Bootstrap returns no password/hash/session/API key plaintext; outbox is specifically guarded demo/development delivery with invitation links, never audit storage. Plaintext keys/tokens appear only at creation or their intentional development email delivery. API key hashes and invite hashes are irreversible, cryptographically generated secrets. No destination from request controls external network access.

## Security model

Server requires authenticated membership for every organization-scoped action/list; resource lookups include organization scope. Central RBAC: OWNER everything; ADMIN projects/members/invites/keys/settings but not owner assignment, owner removal, deletion or billing; MEMBER project writes; VIEWER reads. Owner can't leave/remove/demote self without ownership handling. Demo role switching never changes production membership or accesses another sandbox. Sessions expire; reset/cleanup deletes only that session's demo data. Audit writes are server-only, safe actor/event/target metadata.

## Local startup and tests

`pnpm demo` sets DEMO_MODE=true, DATABASE_DRIVER=pglite, an absolute local .data path, generated process-local development auth secret, APP_URL=http://localhost:3000 and starts Next on loopback. No Docker/.env/live credentials required. Production must refuse missing auth secret and use PostgreSQL, real secure origins and configured email/billing providers.

Use Vitest for real database/service integration and Playwright plus axe for browser QA. Production credentials and deployment environment files must never enter the repository. Screenshots are real browser captures, not mock images.
