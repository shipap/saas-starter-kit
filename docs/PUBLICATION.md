# Publication checklist

This checklist records release requirements. An item is complete only when its result is recorded in the QA or deployment report.

## Repository boundary

- The repository root is `saas-starter-kit`, separate from other portfolio projects.
- Include only application source, configuration, tests, intentional fictional fixtures, documentation, licenses, screenshots and project-scoped design instructions.
- Exclude dependencies, build output, browser reports, private environment files, local databases, deployment credentials and archives.
- Keep `.env.example` as the only versioned environment file.

## Before the initial push

- Run frozen-lockfile installation, unit/integration/browser tests, accessibility scans, lint, format validation, type checking and production build from the clean directory.
- Recheck tenant isolation, roles, invitation and API key hashes, sandbox reset/expiry, webhook signatures and idempotency.
- Review staged files and content for secrets, temporary artifacts and unrelated projects.
- Confirm local Git author and committer are `bububi <97186130+shipap@users.noreply.github.com>`.
- Confirm GitHub authentication is `shipap`, then verify published commit attribution through GitHub's API.
- Check description, topics, license, Markdown links and actual hosted CI results.

## Public demo requirements

- Use PostgreSQL with a persistent volume and no host port mapping.
- Expose the application only through the shared HTTPS gateway.
- Keep billing simulated and email in the development outbox.
- Disable public account creation and normal authentication when the hosted environment has no verified email delivery.
- Preserve per-visitor sandboxes, six-hour expiry, scoped reset and sandbox-scoped platform previews.
- Protect sandbox creation and mutations against abuse; keep operational limits explicit.
- Keep production secrets on the server in a permission-restricted environment file.
- Configure only `saas.rkn.fail`; never modify unrelated services or DNS.

## After deployment

- Verify public TLS, health and every product view.
- Exercise two independent browser contexts, cross-sandbox access denials and server-side role restrictions.
- Test API key creation/revocation, mock billing, invitations/outbox, reset and cleanup.
- Run responsive Chromium and accessibility checks against the actual public application.
- Capture real production screenshots.
- Add the Live Demo link to the README only after these checks pass.
- Record current GitHub Actions status without assuming success.
