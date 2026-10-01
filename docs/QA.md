# Local verification

This phase is local only. No GitHub publication, production deployment, real payment, external email delivery, or OAuth credential is required.

## Reproduce

```sh
pnpm install
pnpm demo
```

Open http://localhost:3000 and choose **Try demo**. The browser receives its own sandbox session. Fixtures are fictional. Demo controls switch the effective workspace role and reset only that sandbox.

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:browser
pnpm build
```

Browser tests use a real Chromium browser against the actual application. They cover the entry page and all product views at 1920×1080, 1440×900, 1024×768, 768×1024, and 390×844. They check document overflow and every axe accessibility finding under WCAG 2 A/AA and 2.1 AA, and capture screenshots from the running product.

Integration tests use fresh in-memory PGlite databases, actual SQL, request handlers, and Better Auth. They do not replace tenant authorization, billing transitions, invitation handling, or API key verification with mocks. The billing provider itself is intentionally local; its signature verification and Stripe SDK adapter are tested without network calls.

## Evidence

Local checks on October 1, 2026:

| Check                                   | Result                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| Billing provider unit tests             | 6 passed                                               |
| Database/HTTP integration tests         | 37 passed in the lead's complete final run             |
| Playwright Chromium product tests       | 9 passed, no retries                                   |
| Axe accessibility scans                 | 59 scans, zero violations under the selected WCAG tags |
| Browser JavaScript errors               | None in the tested journeys                            |
| Five viewport overflow checks           | Passed for every product view and project dialog       |
| Keyboard dialog close/focus restoration | Passed at all five viewport sizes                      |
| QA files ESLint and formatting          | Passed                                                 |

The browser journeys exercise actual project creation and server-backed Owner/Viewer restrictions; team invitation and development outbox acceptance; plan upgrade; one-time API key display and an authenticated API request; audit and team filtering; account updates; and isolated sandbox reset. Dark mode is checked across all eight product views.

Visual QA found a dialog focus restoration defect, a development indicator overlapping screenshots, and theme initialization overwriting a saved dark preference on navigation. These were corrected. The dark-theme test asserts both the document theme and computed dark canvas color on every navigation and reload. Six screenshots show the actual product without the development indicator:

- `docs/images/local-landing-1440.png`
- `docs/images/local-dashboard-1440.png`
- `docs/images/local-dashboard-390.png`
- `docs/images/local-dashboard-dark-1440.png`
- `docs/images/local-billing.png`
- `docs/images/local-team.png`

A configured test or CI workflow is not evidence that it passed. The lead independently ran all 43 Vitest tests (6 unit, 37 integration), workspace-wide ESLint, format validation and TypeScript checks successfully. The production build passed. Its standalone server passed actual health, demo session/bootstrap and Chromium project creation with all requested assets and no JavaScript errors. This caught and corrected PGlite's missing bundled runtime assets before delivery.

`pnpm install --frozen-lockfile` and `pnpm peers check` passed. `pnpm audit --json` reported zero known vulnerabilities. CI YAML and Compose YAML parsed successfully with Prettier; hosted GitHub Actions did not run because this project was not published. Docker CLI/Engine are unavailable, so image builds, container startup and live PostgreSQL were not tested. Browser failure traces and reports are local ignored artifacts.

## Coverage boundaries

PGlite exercises PostgreSQL SQL semantics locally. It does not demonstrate connection pooling, production PostgreSQL transport, multi-instance rate limiting, distributed cleanup, live billing, external email delivery, or configured OAuth provider behavior. Those require a separate deployment phase and real integration credentials.
