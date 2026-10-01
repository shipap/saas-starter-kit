# Public demo deployment

This directory contains deployment templates. Their presence does not mean a server or live demo has been deployed.

## Layout

- Shared gateway: `/opt/rkn-demo-gateway`
- Application checkout: `/opt/demos/saas-starter-kit`
- Private runtime configuration: `/opt/demos/saas-starter-kit/.env.production`, mode `600`
- Shared external Docker network: `rkn-demo-net`
- PostgreSQL volume: `saas-starter-kit-postgres-data`

Only Caddy publishes host ports 80 and 443. The application has no host port mapping; PostgreSQL is attached exclusively to an internal application network. Future demos can join the shared gateway network and add one explicitly approved hostname each. No future routes are preconfigured.

## Safety checks before deployment

Verify the SSH host key against a trusted independent source. Inspect OS, available memory and disk, listening ports, Docker services, active reverse proxies and firewall rules before changing anything. Do not install a second reverse proxy over an existing one. Reuse suitable infrastructure only after reviewing its configuration.

Confirm Cloudflare credentials select the intended account and the `rkn.fail` zone. Inspect the existing `saas.rkn.fail` record before creating an A record. A conflicting target is a stop condition. Use DNS-only mode; do not create wildcard records or change another hostname.

## Runtime configuration

Generate only the secrets used by this application: `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET`. Use cryptographically random hexadecimal values with at least 32 bytes of entropy. Hexadecimal database passwords also avoid URL escaping ambiguity. Never print values or include them in Git. The Cloudflare token remains on the deployment workstation and must never be copied to the server.

The template enables `DEMO_MODE=true` and `PUBLIC_DEMO=true`, PostgreSQL, mock billing and sandboxed development outbox. Normal account creation is unavailable in the public-demo mode. No OAuth, Stripe or SMTP credentials are required.

## Deployment sequence

After the clean checkout passes local QA and the initial source commit is public:

1. Verify server identity and inspect existing infrastructure.
2. Create `rkn-demo-net` only if absent.
3. Clone the published source into the application directory.
4. Generate the private production environment file on the server.
5. Validate Compose without printing its interpolated configuration:

   ```sh
   docker compose --env-file .env.production -f infra/compose.demo.yml config --quiet
   ```

6. Start PostgreSQL, build and start the web service:

   ```sh
   docker compose --env-file .env.production -f infra/compose.demo.yml up -d --build
   ```

7. Confirm container health. Initial additive schema creation runs during platform initialization; it does not drop or reset existing tables. For an existing installation, review schema compatibility before upgrading. Versioned upgrade migrations are a documented extension.
8. Copy the reviewed gateway templates to the shared gateway directory only when no suitable gateway already exists. Validate Caddy configuration before starting or reloading it.
9. Create the approved DNS-only A record pointing to the verified server. Start the gateway and confirm automatic public TLS issuance.
10. Run live health, sandbox isolation, RBAC, API-key, browser and accessibility checks.
11. Add a README live-demo link only after those checks pass.

## Operations

Sandbox lifetime is six hours. The application periodically removes expired sandboxes while running; sandbox creation also triggers cleanup. Reset affects only the authenticated demo sandbox. PostgreSQL persistence survives container replacement.

Do not run `docker compose down -v`: it deletes application data. Back up PostgreSQL with `pg_dump` using a private destination. Preserve Caddy's `/data` volume so certificates and ACME account state survive restarts. Rotate production secrets through the private environment file and recreate only the affected application service.

In-process rate limiting assumes a single application instance. Review a shared limiter before horizontal scaling. Container logs are bounded and must not contain request bodies, credentials or generated plaintext keys.

The demo templates limit web memory to 384 MiB, PostgreSQL to 256 MiB and Caddy to 96 MiB. Reassess those budgets against measured usage before increasing concurrency. On a small shared server, avoid an unbounded build: use a separately constrained BuildKit builder or build on a suitable machine and deploy the resulting image. Runtime limits do not automatically constrain image compilation. Preserve unrelated applications, networks, volumes and firewall rules.
