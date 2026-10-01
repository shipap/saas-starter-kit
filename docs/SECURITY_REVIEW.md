# Security review

This review covers the local starter and its single-instance public demonstration. It does not certify commercial deployments or unconfigured external providers.

## Required checks

- Every workspace read and mutation requires a server-validated membership. Foreign organization IDs and foreign resource IDs must fail.
- Central roles authorize mutations independently of UI controls. The last owner cannot leave, remove, or demote their membership without ownership handling.
- Demo sessions, role switching, reset, outbox delivery, and platform preview remain demo-only and scoped to the caller's sandbox.
- API keys and invitation secrets are random and stored as hashes. Secret plaintext is absent from list responses and audit records. Revocation, expiry, one-time acceptance, and API scopes are tested.
- Mutations validate Origin and typed input. User text remains data in parameterized SQL and React rendering.
- Billing webhooks authenticate the raw payload and deduplicate event IDs. External callbacks do not control arbitrary network destinations.
- Better Auth handles normal password hashing, sessions, authentication errors, and logout. No handmade password cryptography.
- Platform administration requires a separate authorization boundary; workspace ADMIN is insufficient.

## Operational limits

In-process rate limits protect a single demo process, not a distributed deployment. Production requires a shared store or reverse-proxy policy. PostgreSQL provisioning, provider secrets, TLS, trusted proxy configuration, backup retention, email verification/recovery, and live webhook delivery need deployment-specific validation.

Demo invitation emails contain only a non-secret workspace link and invitation ID. The sandbox-scoped acceptance control exercises invitations without persisting plaintext bearer tokens. Normal invitation delivery passes the token only to the configured email provider; the application stores its SHA-256 hash.

## Executed review

The local integration suite exercised foreign organization reads and mutations for projects, members, keys, audit and settings, as well as foreign resource IDs within an otherwise permitted tenant. Server denials were verified rather than inferred from hidden buttons.

All four roles were tested against project writes, invitations, billing changes, API key creation, workspace changes and owner-only deletion. Last-owner leave/remove/demotion and ADMIN ownership assignment were rejected. Authenticated normal accounts could not use demo role/reset controls or platform administration.

A separately configured platform-admin user was also tested positively: the same authenticated normal account received 403 without an explicit allowlist and 200 with its user ID allowlisted. The response contained operational data without credential hashes.

Key creation, hash-only persistence, one-time list omission, valid/invalid credentials, missing scopes, cross-tenant access and revocation passed. Invitation tests covered valid acceptance, duplicates, expiration, revocation, repeat use and another tenant's invitation. The development outbox was checked for absence of bearer tokens; the normal provider contract separately verifies genuine token-based recipient acceptance.

Billing transitions, cancellation/reactivation, invalid signatures and duplicate webhook delivery passed against local providers. Official Stripe SDK signature fixtures verified the adapter boundary without contacting Stripe. Better Auth registration, login, password hash persistence and logout were tested through its real HTTP endpoints. A normal invitation was exercised with real authenticated accounts: an unverified recipient and a verified wrong recipient received 403; the verified intended recipient joined with the assigned role, and replay was rejected.

Demo cookies were checked for HttpOnly protection, sandbox isolation, expiry and reset scoping. Foreign-Origin mutations were denied. SQL-looking project names remained data. Audit records omitted plaintext keys and invitation tokens. A 1,005-event regression verified that aggregate usage remains accurate when the recent-event list is capped.

The public deployment uses PostgreSQL with no host port mapping, a non-root web container with no host port mapping, and a separately bounded Caddy gateway. Runtime secrets were generated on the server and stored in a mode-600 ignored environment file. The deployment-time Cloudflare token remained on the workstation. Private SSH key contents were not read or displayed. No real billing, OAuth or email credentials were configured.

## Public demo preparation

`PUBLIC_DEMO=true` requires `DEMO_MODE=true`. It rejects normal authentication endpoints and normal account sessions on the server, and hides sign-in from the entry page. Production public mode requires HTTPS and PostgreSQL. It does not use OAuth, SMTP, or payment credentials.

Each visitor receives a random HttpOnly, SameSite=Lax cookie, with Secure enabled on HTTPS. Only its hash is persisted. Sandbox expiry is six hours; a 60-second unreferenced timer removes up to 100 expired sandboxes per sweep, including their organizations and users. Closing the platform clears the timer. Cleanup also runs before new sandbox creation.

A single process admits at most 20 new sandboxes per minute and caps active sandboxes at 200. Server-validated user IDs key mutation limits (120/minute), reset (6/minute), and combined API-key/invitation creation (20/minute); modifying unrelated cookie fields does not bypass them. No IP address is stored for these limits. Scoped API keys remain limited to 60 requests/minute; the global API ceiling is 1,000/minute. Resource quotas bound projects, keys, invitations, outbox and audit growth. Horizontal scaling needs shared rate-limit storage.

Platform Admin Demo queries only the caller's sandbox and displays only that sandbox's session. Other visitors and real-account rows are excluded. Billing remains simulated and email remains in the isolated outbox.

The public-mode integration suite covers authentication rejection, independent visitors, cross-sandbox IDs, isolated reset, private platform preview, invalid cookies, token-free outbox, stable reset limits, and expired-session cleanup while preserving active visitors. Production browser and database evidence is recorded separately after deployment.

## Live verification

The live two-context test verified foreign sandbox IDs fail, another visitor's reset is denied, mutations stay isolated and the Platform Admin Demo excludes other visitors. Forbidden Viewer, Member and Admin actions returned server denials. Valid keys worked, foreign-tenant use failed and revoked keys returned 401. Actual PostgreSQL rows were checked for hashed API keys and invitation tokens, with token-free outbox content.

A targeted cleanup test expired only its own QA session in PostgreSQL. The periodic timer removed it and its sandbox while preserving a separately active visitor. Normal public authentication was disabled and the normal-account table remained empty. HTTPS cookies were checked for Secure and HttpOnly. Real browser accessibility and responsive results are in [the QA record](QA.md).

The demonstration's application key prefix starts with `sk_demo_`; these are temporary keys for this application, not external-provider secrets. In-process rate limits and six-hour TTL bound a single demo instance but do not replace shared controls for a commercial distributed deployment.
