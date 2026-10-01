# Verification record

Verified on October 1, 2026, from the independent publication checkout and the deployed application. Test configuration alone is not a passing result.

## Clean local checkout

| Check                                                            | Result                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Frozen dependency installation and peer compatibility            | PASS                                                       |
| Billing provider unit tests                                      | 6 passed                                                   |
| Database, HTTP, authentication and public-demo integration tests | 42 passed                                                  |
| Full Vitest suite                                                | 48 passed                                                  |
| ESLint, Prettier and TypeScript                                  | PASS                                                       |
| Next.js production build                                         | PASS                                                       |
| Chromium product suite                                           | 9 passed in the complete stable run                        |
| Accessibility                                                    | 59 axe scans, zero violations under WCAG 2 A/AA and 2.1 AA |
| Dependency audit                                                 | Zero reported known vulnerabilities                        |

The local suite uses real PGlite SQL and request handlers. Billing is deliberately mocked; signature fixtures exercise the official Stripe SDK without network calls. Local screenshots remain available in `docs/images/local-*.png`.

The first release-browser attempt encountered a connection refusal during a development-server restart after configuration editing. The complete suite passed after the server stabilized. No retry was needed in that final local run.

## PostgreSQL-backed public deployment

Live application: https://saas.rkn.fail

| Check                                                    | Result                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Constrained Linux Docker image build                     | PASS                                                                                                     |
| Application and gateway Compose validation               | PASS                                                                                                     |
| PostgreSQL 17 startup and additive schema initialization | PASS, 16 tables                                                                                          |
| Application/container health                             | PASS                                                                                                     |
| Public HTTPS health                                      | HTTP 200, publicly trusted Let's Encrypt certificate                                                     |
| Live Chromium suite                                      | 10 passed, no retries                                                                                    |
| Responsive coverage                                      | 1920x1080, 1440x900, 1024x768, 768x1024, 390x844                                                         |
| Live accessibility                                       | 61 axe scans, zero violations under selected WCAG tags                                                   |
| Two independent visitor contexts                         | PASS: separate mutations, foreign IDs rejected, isolated reset                                           |
| Server RBAC                                              | Viewer project write, Member key creation and Admin billing denied                                       |
| Mock billing                                             | Free/Pro/Business transitions, cancellation and reactivation passed                                      |
| API keys                                                 | Creation, scoped request, foreign tenant denial and revoked-key rejection passed                         |
| PostgreSQL key storage                                   | Positive row matched SHA-256 of the newly issued key; plaintext absent from lists                        |
| Invitation storage                                       | Positive row contained a 64-character hash; outbox contained no bearer token                             |
| Secure session cookie                                    | HttpOnly and Secure checked on HTTPS                                                                     |
| Automatic cleanup                                        | A specifically expired QA sandbox was removed by the timer; an active second visitor remained accessible |
| Hosted GitHub Actions                                    | Initial release and Compose-fix runs reported success                                                    |

The live product suite covers landing, Overview, Projects, Team, Billing, API Keys, Audit, Settings, Dev outbox and sandboxed Platform Admin; project dialogs and focus restoration; invitation acceptance; theme persistence; search/filter; reset and keyboard navigation. The local-only screenshot-capture test was excluded to preserve the original local assets. Two additional public-mode tests verify sign-in hiding, Source attribution and independent visitor security, and capture genuine production images.

Real production captures:

- `docs/images/live-landing-1440.png`
- `docs/images/live-dashboard-dark-1440.png`
- `docs/images/live-dashboard-390.png`
- `docs/images/social-preview.png` (1280x640 browser capture, not a fabricated composition)

The lead inspected the desktop landing, dark dashboard, mobile dashboard and social-preview image. No horizontal overflow or browser JavaScript errors were found in the tested journeys.

Compose initially rejected duplicate resource-limit fields. They were removed in a corrective source commit; both Compose configurations then validated and the deployment succeeded. No destructive migration or database reset was used.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

The browser runner starts the local demonstration when necessary. Public checks mutate only their own temporary fictional sandboxes. Run the live checks against an already healthy deployment:

```sh
PUBLIC_QA=true BASE_URL=https://saas.rkn.fail pnpm exec playwright test --grep-invert "capture genuine local product screenshots"
```

On PowerShell, set these environment variables with `$env:PUBLIC_QA='true'` and `$env:BASE_URL='https://saas.rkn.fail'`, and use `pnpm.cmd` if script execution is restricted.

## Coverage boundaries

No live OAuth, SMTP, payment, or external business API credentials were used. Mock/provider fixtures do not prove those integrations work with real accounts. The single-instance demonstration does not establish high-load capacity, multi-instance rate limiting, distributed cleanup, disaster recovery or PostgreSQL failover. Hosted CI results should be checked for each subsequent commit.
