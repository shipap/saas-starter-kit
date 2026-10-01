import { expect, test, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import type { AppState } from "../../packages/shared/src/types";

test.describe("public deployment verification", () => {
  test.skip(
    process.env.PUBLIC_QA !== "true",
    "Enable PUBLIC_QA for the public-mode deployment.",
  );
  test("independent visitors, server RBAC, keys, billing, reset and admin scope", async ({
    browser,
    baseURL,
  }) => {
    const contexts: BrowserContext[] = [];
    const origin = new URL(baseURL!).origin;
    async function visitor() {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      expect(
        (
          await context.request.post("/api/demo/start", {
            headers: { Origin: origin },
            data: {},
          })
        ).status(),
      ).toBe(200);
      const state = (await (
        await context.request.get("/api/bootstrap")
      ).json()) as AppState;
      return { context, state };
    }
    const a = await visitor(),
      b = await visitor();
    const action = (
      client: typeof a,
      action: string,
      fields = {},
      organizationId = client.state.organization.id,
    ) =>
      client.context.request.post("/api/actions", {
        headers: { Origin: origin },
        data: { action, organizationId, ...fields },
      });
    try {
      const projectName = "Live isolation fixture";
      expect(
        (
          await action(a, "project.create", {
            name: projectName,
            description: "Fictional browser QA data",
          })
        ).status(),
      ).toBe(200);
      const stateB = (await (
        await b.context.request.get("/api/bootstrap")
      ).json()) as AppState;
      expect(stateB.projects.some((p) => p.name === projectName)).toBe(false);
      expect(
        (
          await b.context.request.get(
            `/api/bootstrap?organizationId=${a.state.organization.id}`,
          )
        ).status(),
      ).toBe(404);
      expect(
        (
          await a.context.request.get(
            `/api/bootstrap?organizationId=${b.state.organization.id}`,
          )
        ).status(),
      ).toBe(404);
      expect(
        (await action(b, "demo.reset", {}, a.state.organization.id)).status(),
      ).toBe(404);
      const admin = await (await b.context.request.get("/api/platform")).json();
      expect(JSON.stringify(admin)).not.toContain(a.state.user.id);
      expect(admin.sessions).toHaveLength(1);
      for (const [role, forbiddenAction, fields] of [
        ["VIEWER", "project.create", { name: "Forbidden" }],
        [
          "MEMBER",
          "key.create",
          { name: "Forbidden", scopes: ["projects:read"] },
        ],
        ["ADMIN", "billing.plan", { plan: "BUSINESS" }],
      ] as const) {
        expect((await action(a, "demo.role", { role })).status()).toBe(200);
        expect((await action(a, forbiddenAction, fields)).status()).toBe(403);
      }
      expect((await action(a, "demo.role", { role: "OWNER" })).status()).toBe(
        200,
      );
      const issued = await action(a, "key.create", {
        name: "Live QA scoped key",
        scopes: ["projects:read"],
      });
      expect(issued.status()).toBe(200);
      const key = (await issued.json()) as { id: string; key: string };
      const listed = await (
        await a.context.request.get("/api/bootstrap")
      ).json();
      expect(JSON.stringify(listed)).not.toContain(key.key);
      const headers = { Authorization: `Bearer ${key.key}` };
      expect(
        (await a.context.request.get("/api/v1/projects", { headers })).status(),
      ).toBe(200);
      expect(
        (
          await a.context.request.get(
            `/api/v1/projects?organizationId=${b.state.organization.id}`,
            { headers },
          )
        ).status(),
      ).toBe(403);
      expect((await action(a, "key.revoke", { id: key.id })).status()).toBe(
        200,
      );
      expect(
        (await a.context.request.get("/api/v1/projects", { headers })).status(),
      ).toBe(401);
      for (const plan of ["FREE", "PRO", "BUSINESS", "PRO"])
        expect((await action(a, "billing.plan", { plan })).status()).toBe(200);
      for (const name of ["billing.cancel", "billing.reactivate"])
        expect((await action(a, name)).status()).toBe(200);
      expect((await action(b, "demo.reset")).status()).toBe(200);
      const retained = (await (
        await a.context.request.get("/api/bootstrap")
      ).json()) as AppState;
      expect(retained.projects.some((p) => p.name === projectName)).toBe(true);
      expect((await action(a, "demo.reset")).status()).toBe(200);
    } finally {
      for (const context of contexts) await context.close();
    }
  });
  test("public landing, links and genuine live screenshots", async ({
    page,
    baseURL,
  }) => {
    await mkdir("docs/images", { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(
      page.getByText("INTERACTIVE DEMO", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in/i })).toHaveCount(0);
    await expect(
      page.getByText(/resets automatically after six hours/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Source/ })).toHaveAttribute(
      "href",
      "https://github.com/shipap/saas-starter-kit",
    );
    const axes = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axes.violations).toEqual([]);
    if (new URL(baseURL!).hostname === "saas.rkn.fail")
      await page.screenshot({
        path: "docs/images/live-landing-1440.png",
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Try demo", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/app\/overview/);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      /Opening|Unable/,
    );
    await page.goto("/app/settings");
    await page.getByRole("button", { name: /^dark$/i }).click();
    await page.goto("/app/overview");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      /Opening|Unable/,
    );
    if (new URL(baseURL!).hostname === "saas.rkn.fail")
      await page.screenshot({
        path: "docs/images/live-dashboard-dark-1440.png",
        fullPage: true,
      });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(mobile.violations).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    if (new URL(baseURL!).hostname === "saas.rkn.fail")
      await page.screenshot({
        path: "docs/images/live-dashboard-390.png",
        fullPage: true,
      });
  });
});
