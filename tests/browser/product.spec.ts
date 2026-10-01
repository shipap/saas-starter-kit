import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "Unexpected browser JavaScript errors").toEqual([]);
    },
    { auto: true },
  ],
});

async function demo(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Try demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/overview/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    /Opening your workspace|Unable to open/,
  );
}
async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}
async function darkTheme(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(async () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(16, 19, 25)");
}
const views = [
  "overview",
  "projects",
  "team",
  "billing",
  "keys",
  "audit",
  "settings",
  "platform",
];
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1024, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`complete responsive product at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noOverflow(page);
    await accessible(page);
    await demo(page);
    for (const view of views) {
      await page.goto(`/app/${view}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
        /Opening your workspace|Unable to open/,
      );
      await noOverflow(page);
      await accessible(page);
      if (view === "projects") {
        const trigger = page.getByRole("button", { name: "New project" });
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await accessible(page);
        await noOverflow(page);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
        await page.getByLabel("Demo role").selectOption("VIEWER");
        await expect(trigger).toBeDisabled();
        await page.getByLabel("Demo role").selectOption("OWNER");
        await expect(trigger).toBeEnabled();
      }
    }
  });
}
test("demo mutations and actual server permissions", async ({ page }) => {
  await demo(page);
  await page.goto("/app/projects");
  await page
    .getByRole("button", { name: /create project|new project/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/project name/i).fill("Browser QA Project");
  await dialog
    .getByLabel(/description/i)
    .fill("A fictional project created during end-to-end QA.");
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Browser QA Project", { exact: true }),
  ).toBeVisible();
  await page.getByLabel(/demo role/i).selectOption("VIEWER");
  await expect(
    page.getByRole("button", { name: /create project|new project/i }).first(),
  ).toBeDisabled();
  await page.getByLabel(/demo role/i).selectOption("OWNER");
  await expect(
    page.getByRole("button", { name: /create project|new project/i }).first(),
  ).toBeEnabled();
});
test("dark theme remains accessible", async ({ page }) => {
  await demo(page);
  await page.goto("/app/settings");
  await page.getByRole("button", { name: /^dark$/i }).click();
  await darkTheme(page);
  const save = page
    .getByRole("button", { name: /save.*profile|save.*account|save changes/i })
    .first();
  if (await save.count()) await save.click();
  for (const view of views) {
    await page.goto(`/app/${view}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      /Opening your workspace|Unable to open/,
    );
    await noOverflow(page);
    await darkTheme(page);
    await accessible(page);
  }
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    /Opening your workspace|Unable to open/,
  );
  await darkTheme(page);
});
test("team invitation, billing, API integration, audit and sandbox reset", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/app/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Email address")
    .fill("browser-invite@example.invalid");
  await dialog
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption("VIEWER");
  await accessible(page);
  await noOverflow(page);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("browser-invite@example.invalid", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open development outbox" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Development outbox" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Open demo invitation" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("5 members", { exact: true })).toBeVisible();
  await page.getByLabel("Search team").fill("browser-invite");
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "browser-invite@example.invalid" }),
  ).toBeVisible();
  await page.goto("/app/billing");
  await page.getByRole("button", { name: "Switch to Business" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to Pro" }),
  ).toBeEnabled();
  await page.goto("/app/keys");
  await page.getByRole("button", { name: "Create API key" }).click();
  await dialog.getByLabel("Key name").fill("Browser integration");
  await dialog.getByRole("button", { name: "Create key" }).click();
  await expect(
    dialog.getByRole("textbox", { name: "API key", exact: true }),
  ).toBeVisible();
  const key = await dialog
    .getByRole("textbox", { name: "API key", exact: true })
    .inputValue();
  const result = await page.request.get("/api/v1/projects", {
    headers: { Authorization: `Bearer ${key}` },
  });
  expect(result.status()).toBe(200);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText("Browser integration", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/audit");
  await page.getByLabel("Search audit log").fill("Browser integration");
  await expect(
    page.getByText("Browser integration", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/settings");
  await page.getByLabel("Full name").fill("Alexander QA");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile updated");
  await page.getByRole("button", { name: "Reset sandbox" }).click();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/app/team");
  await expect(page.getByText("4 members", { exact: true })).toBeVisible();
});
test("capture genuine local product screenshots", async ({ page }) => {
  await mkdir("docs/images", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({
    path: "docs/images/local-landing-1440.png",
    fullPage: true,
  });
  await demo(page);
  await page.screenshot({
    path: "docs/images/local-dashboard-1440.png",
    fullPage: true,
  });
  for (const view of ["billing", "team"]) {
    await page.goto(`/app/${view}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      /Opening your workspace|Unable to open/,
    );
    await page.screenshot({
      path: `docs/images/local-${view}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    /Opening your workspace|Unable to open/,
  );
  await page.screenshot({
    path: "docs/images/local-dashboard-390.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/settings");
  await page.getByRole("button", { name: /^dark$/i }).click();
  await expect(page.getByRole("button", { name: /^dark$/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await darkTheme(page);
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    /Opening your workspace|Unable to open/,
  );
  await darkTheme(page);
  await page.screenshot({
    path: "docs/images/local-dashboard-dark-1440.png",
    fullPage: true,
  });
});
