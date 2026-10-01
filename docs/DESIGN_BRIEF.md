# Relay: product design brief

Relay is a fictional workspace console demonstrating the SaaS Starter Kit. It is not a real business. The application, rather than a marketing landing page, is the primary deliverable.

## Direction

An engineering control room with editorial clarity: a compact graphite navigation rail, carefully aligned data, off-white working surfaces, cobalt selection markers, and a distinctive bracket/relay mark. The signature detail is a fine vertical cobalt rail beside the current workspace and page, repeated in restrained progress indicators. No decorative dashboard mockups or arbitrary metrics.

The entry page says “SaaS Starter Kit,” explains the reusable business foundation, and offers Try demo as its clear primary action. A real, server-created sandbox follows immediately. Show a concise architecture section rather than an oversized marketing page. Subtle footer: Open-source demo by bububi, Portfolio, Need a custom version. Source appears only when configured.

## Palette and typography

Light: canvas #f4f5f7, surface #ffffff, ink #17202e, secondary #536071, line #dce1e8, accent #2456db, success #18704b. Dark: canvas #101319, surface #171c24, ink #edf1f7, secondary #a9b4c4, line #303a48, accent #8cafff, success #82d5ac. Verify actual contrast rather than assuming it.

Self-host Manrope for the product title and larger headings; DM Sans for body, navigation and forms. Monospaced/tabular numerals for IDs, dates and usage. Use actual font packages with their licenses. Base body 15–16px, compact metadata at least 12px, mobile inputs 16px. Titles 28–36px; entry title may be larger. Use semantic CSS tokens throughout.

## Geometry and rhythm

Four/eight-pixel spacing rhythm: 4, 8, 12, 16, 24, 32, 48. Restrained 4–8px radii, precise dividers, subtle shadow only for floating surfaces. Group through alignment and whitespace rather than placing every section in a rounded card. Tables are first-class product surfaces with useful empty, loading and filter states.

## Dashboard hierarchy

Persistent workspace switcher and grouped navigation. Header contains page context and one primary action. Overview uses four compact, divided metric columns, then an actual usage series and recent audit activity, with a project status table below. Counts and charts derive from database records; seed data is explicitly fictional. Billing displays current plan and state before plan choices. API keys reveal the secret only once. Team joins members and pending invites clearly. Audit uses readable actors, event labels, targets and times.

## Interaction and responsive behavior

First apply frontend-design for visual direction, then ui-ux-pro-max for usability. Destructive changes use a labeled native dialog with Cancel, initial focus, Escape and focus restoration. Every form has visible labels, pending feedback and specific errors. No placeholder-only labels. Real filters on projects, team and audit. Cmd/Ctrl+K may open a useful navigation palette; keyboard shortcuts must not intercept input editing.

Desktop above 1024px: 232px sidebar, bounded content width, readable data density. Tablet: compact navigation without clipping. Mobile: top bar and accessible navigation drawer, full-width primary controls, stacked metrics and readable row layouts; no page-level horizontal overflow. Preserve workspace/page URL on reload. Controls have at least 44px touch targets. Test 1920×1080, 1440×900, 1024×768, 768×1024 and 390×844.

Light, dark and system themes share hierarchy but have individually selected surfaces and state colors. Persist preference. Motion lasts 150–220ms, communicates state, and respects prefers-reduced-motion. No continuous decorative animation.

## References and boundaries

- [Linear features](https://linear.app/features): clear navigation hierarchy, restrained control density and task-oriented composition. Do not copy its layout, brand or product screenshots.
- [Vercel Geist](https://vercel.com/geist/introduction): high-contrast semantic surfaces, precise borders and developer-tool legibility. Do not reuse Vercel logos or recreate its dashboard.
- [Stripe Dashboard basics](https://docs.stripe.com/dashboard/basics): separate operational navigation, account settings and financial state. Do not copy Stripe's branding or imply live payments.
- [Drizzle/PGlite](https://orm.drizzle.team/docs/connect-pglite): informs truthful local architecture, not visual styling.

No purple gradient template, card soup, glassmorphism, testimonial/logo clouds, visitor counters, fake customers, random charts, skill bars, emojis as icons, or generated screenshots. The frontend-design and ui-ux-pro-max instruction-only skills were read and installed project-locally. ui-ux-pro-max source: https://github.com/Hitbullets/codex-skills/tree/main/codex-frontend-design/skills/ui-ux-pro-max. No external scripts executed.
