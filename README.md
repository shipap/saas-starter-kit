# SaaS Starter Kit

Build a multi-tenant SaaS product without starting again with accounts, workspaces, team permissions, billing state and API access.

The starter demonstrates those foundations through **Relay**, a fictional B2B workspace console. Open the demo without a password, create projects, invite a teammate through a development outbox, switch roles, try mock plans and issue a real workspace API key. Every demo visitor gets an isolated sandbox. The next step for a client is adding their business-specific feature to this foundation.

Relay and its seeded people, organizations and activity are fictional. Billing is simulated and email stays in a development outbox; no real payments or messages are sent.

## Local demo

Requires Node.js 24 LTS and pnpm 12.8.1. From this directory:

```sh
pnpm install
pnpm demo
```

Open **http://localhost:3000** and choose **Try demo**. No Docker, external credentials, real payments or outgoing email are needed. The startup command prepares local database configuration and starts the application on loopback. Initialization applies the schema; each new sandbox is seeded independently. Use **Demo controls** to switch Owner/Admin/Member/Viewer, reset the sandbox or open the development outbox.

## Demo behavior

Each visitor receives a separate sandbox containing fictional workspaces, members, projects and activity. Sessions expire after **six hours**. Reset restores only the current visitor's seeded data. Role switching affects that sandbox's effective role; it never grants normal account or global administrator privileges. The platform preview shows only the caller's sandbox.

Billing is simulated and invitations stay in the guarded development outbox. Demo API keys authenticate requests to this application only. No external service, payment provider or email account is connected.

## Features

- Better Auth email/password sessions and optional configured OAuth providers, separate from demo sessions.
- Organization creation, switching and settings with membership checks on the server.
- Centralized four-role authorization and protected ownership operations.
- Projects with search, status filtering, create/edit/archive and permission-aware controls.
- Expiring, one-use team invitations, role management and a development email outbox.
- Free, Pro and Business plan state through mock billing; a Stripe adapter boundary for later integration.
- Workspace API keys, one-time plaintext reveal, hashes at rest, revocation and scopes.
- API usage records, scoped audit events and meaningful dashboard totals.
- Account preferences, light/dark/system themes and a guarded platform administration preview.
- Isolated demo sandboxes with expiration and scoped reset; no shared destructive reset.

## Screenshots

Real screenshots from the local application:

![Relay workspace overview](docs/images/local-dashboard-1440.png)

<details>
<summary>Landing, mobile, billing and team views</summary>

![Demo entry](docs/images/local-landing-1440.png)
![Mobile workspace](docs/images/local-dashboard-390.png)
![Dark workspace](docs/images/local-dashboard-dark-1440.png)
![Demo billing](docs/images/local-billing.png)
![Team management](docs/images/local-team.png)

</details>

## Architecture

```mermaid
flowchart LR
    Browser[Relay web interface] --> Next[Next.js API bridge]
    Next --> Auth[Better Auth or isolated demo session]
    Auth --> Policy[Membership and centralized RBAC]
    Policy --> Services[Workspace business services]
    Services --> Database[Parameterized SQL and Drizzle auth schema]
    Database --> Local[PGlite for local review]
    Database --> PG[PostgreSQL for production]
    Services --> Outbox[Development email outbox]
    Services --> Billing[Mock billing / Stripe adapter]
    Key[Workspace API key] --> API[Scoped example API]
    API --> Policy
```

`apps/web` contains the product interface and a thin API bridge. `packages/platform` owns business operations. `packages/db`, `auth`, `billing`, `email` and `shared` contain the persistence/auth/provider boundaries and shared data contracts. Tests live in `tests`; startup tooling lives in `scripts`. The repository is self-contained; it includes no adjacent projects or their dependencies.

Design direction and research: [Design brief](docs/DESIGN_BRIEF.md). Server/API contracts: [Implementation contracts](docs/CONTRACTS.md). Self-hosted fonts retain their [Manrope license](docs/licenses/Manrope-OFL.txt) and [DM Sans license](docs/licenses/DM-Sans-OFL.txt).

## RBAC matrix

| Capability                              | Owner          | Admin | Member | Viewer |
| --------------------------------------- | -------------- | ----- | ------ | ------ |
| Read projects, team and audit           | Yes            | Yes   | Yes    | Yes    |
| Create/edit/archive projects            | Yes            | Yes   | Yes    | No     |
| Manage invites and non-owner members    | Yes            | Yes   | No     | No     |
| Manage API keys and workspace settings  | Yes            | Yes   | No     | No     |
| Change billing plan/state               | Yes            | No    | No     | No     |
| Delete organization / ownership actions | Yes, protected | No    | No     | No     |

Workspace Admin is not Platform Admin. Hiding or disabling controls is only presentation: server checks are mandatory for every operation. Owner removal, demotion and leaving are blocked; ownership transfer needs a separate explicit workflow. Demo role switching is available only inside a demo sandbox and does not grant access to normal organizations.

## Multi-tenancy and database architecture

All organization-scoped reads and mutations require authenticated membership. A resource ID or organization ID supplied by a client is never sufficient authorization. API keys derive their tenant from their stored record. Demo session IDs and workspace IDs are separate; each sandbox contains its own seeded workspaces.

PGlite runs PostgreSQL in-process for Docker-free local development. It is not a fake in-memory business store. The production driver uses PostgreSQL through `pg`; the schema and data contracts stay the same. PGlite is a single-process development database, not a production multi-worker replacement. The same initial schema is applied through both drivers. Validate PostgreSQL connectivity and migrations in the target environment before deployment.

## Billing, invitations and API keys

Mock billing allows safe plan changes, cancellation and reactivation without money. Provider webhooks verify signatures and deduplicate stored event IDs before state transitions. The official Stripe SDK adapter verifies subscription-event fixtures; it is injected through `createPlatform({ billingProvider })`, not activated by an environment switch. Production checkout, price/customer mapping and handling out-of-order provider events still need integration. Live Stripe calls were not tested.

Invitation tokens and API keys are cryptographically random and hashed before storage. Tokens expire and can be used once. Plaintext API keys are shown only when created. The development outbox intentionally represents email delivery, including invitation links; it is not an audit log or a production email service.

For the example API, create a key with project-read scope in the UI:

```sh
curl http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer YOUR_NEWLY_CREATED_KEY"
```

Do not commit the key. Requests are tenant-scoped and tracked as usage. The UI displays actual stored usage and audit records; seed activity is fictional and labeled.

## Configuration

`.env.example` documents local and production settings. `pnpm demo` supplies safe development configuration without an environment file. Production requires a stable, independently generated `BETTER_AUTH_SECRET`, PostgreSQL URL and exact HTTPS application origin. Leave OAuth and Stripe credentials blank for the public demo. Real email delivery is injected through `createPlatform({ emailProvider })`; normal production invitations refuse to send without it.

Normal local sign-up uses Better Auth and a separate account session. Its verification email is available from the authenticated development outbox only on localhost with demo mode enabled. Invitation acceptance requires the verified recipient email. The database initializes its idempotent initial schema automatically; future schema upgrades need versioned migrations.

Public attribution is configured with `PUBLIC_PORTFOLIO_URL`, `PUBLIC_CONTACT_EMAIL`, `PUBLIC_TELEGRAM_URL` and optional `PUBLIC_SOURCE_URL`. The Source link is hidden when no real source URL is configured. None of these public settings may contain secrets.

## Testing

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm build
```

Playwright tests require an installed Chromium browser (`pnpm exec playwright install chromium`). Vitest uses isolated local test databases. [QA record](docs/QA.md) records actual counts and outcomes. [Security review](docs/SECURITY_REVIEW.md) records verified protections and outstanding production boundaries.

## Security and production notes

Treat membership, RBAC, key scopes, invitation recipient identity, webhook verification and platform permissions as server responsibilities. Session cookies are HttpOnly; cookie-authenticated mutations validate the request origin. Validate all input, bound request sizes, use parameterized queries and never log secrets. Audit records are written only by server operations and must not include passwords or plaintext tokens.

For a commercial deployment, configure HTTPS, durable secrets, verified email delivery, required providers, backups/restore drills, monitoring and retention policies. Distributed deployments require shared rate limiting and production database tests. Review the documented demo TTL and cleanup behavior before exposing public sandboxes. Mock billing is not a completed live payment integration.

Docker/Compose files provide a PostgreSQL-backed deployment architecture. Generate independent random `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET`, set the exact HTTPS `APP_URL`, and validate the image/Compose stack in the target environment. No Docker/container success is claimed unless recorded in QA. Never remove persistent volumes during upgrades.

## Limitations

This is a reusable product foundation, not a finished industry-specific SaaS. It includes one resource type, not a full project management suite. Local email stays in the development outbox and billing uses mocks. Commercial plan entitlements are illustrative, not enforced quotas. Rate limiting is per process and needs a shared store for multiple instances. Ownership transfer, provider checkout, external email delivery and versioned schema upgrades remain extension points. Live OAuth, email, Stripe and production PostgreSQL need separate integration tests. The public demonstration uses isolated temporary sandboxes, mock billing and the development outbox; it is not a production customer service.

## Author & Custom Development

Built and maintained by **bububi / Alexander** — [@shipap](https://github.com/shipap).

Need a custom version, integration, deployment, or a similar SaaS product?

Portfolio: [https://bububi.icu](https://bububi.icu)

Email: [work@bububi.icu](mailto:work@bububi.icu)

Telegram: [https://t.me/o3amfeels](https://t.me/o3amfeels)

GitHub: [https://github.com/shipap](https://github.com/shipap)
