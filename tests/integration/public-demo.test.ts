import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlatform } from "../../packages/platform/src";
import type { AppState } from "../../packages/shared/src/types";

const origin = "https://demo.example.test";
let platform: Awaited<ReturnType<typeof createPlatform>>;
let now: Date;
async function request(path: string, cookie = "", payload?: unknown) {
  return platform.handleRequest(
    new Request(`${origin}${path}`, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
  );
}
async function visitor() {
  const response = await request("/api/demo/start", "", {});
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("Secure");
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const state = (await (
    await request("/api/bootstrap", cookie)
  ).json()) as AppState;
  return { cookie, state };
}
async function action(
  client: Awaited<ReturnType<typeof visitor>>,
  action: string,
  fields = {},
) {
  return request("/api/actions", client.cookie, {
    action,
    organizationId: client.state.organization.id,
    ...fields,
  });
}
beforeEach(async () => {
  now = new Date("2026-10-01T12:00:00Z");
  platform = await createPlatform({
    demoMode: true,
    publicDemo: true,
    databasePath: "memory://",
    appUrl: origin,
    authSecret: "test-public-secret-more-than-32-characters",
    now: () => now,
  });
});
afterEach(async () => {
  await platform.close();
});
describe("public demo boundary", () => {
  it("denies normal signup, sign-in, OAuth and local verification outbox", async () => {
    for (const path of [
      "/api/auth/sign-up/email",
      "/api/auth/sign-in/email",
      "/api/auth/sign-in/social",
    ])
      expect(
        (
          await request(path, "", {
            email: "fictional@example.test",
            password: "not-a-real-password",
          })
        ).status,
      ).toBe(404);
    expect((await request("/api/auth/get-session")).status).toBe(404);
    expect((await request("/api/development/outbox")).status).toBe(404);
    expect(
      (await platform.db.query("SELECT * FROM auth_user")).rows,
    ).toHaveLength(0);
  });
  it("keeps platform preview and reset within the caller's sandbox", async () => {
    const a = await visitor(),
      b = await visitor();
    expect(
      (
        await action(a, "project.create", {
          name: "Visitor A private mutation",
          description: "Fictional",
        })
      ).status,
    ).toBe(200);
    const beforeB = (await (
      await request("/api/bootstrap", b.cookie)
    ).json()) as AppState;
    expect(
      beforeB.projects.some((p) => p.name === "Visitor A private mutation"),
    ).toBe(false);
    expect(
      (
        await request(
          `/api/bootstrap?organizationId=${a.state.organization.id}`,
          b.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request("/api/actions", b.cookie, {
          action: "demo.reset",
          organizationId: a.state.organization.id,
        })
      ).status,
    ).toBe(404);
    const admin = await (await request("/api/platform", b.cookie)).json();
    expect(JSON.stringify(admin)).not.toContain(a.state.user.id);
    expect(admin.sessions).toHaveLength(1);
    expect((await action(b, "demo.reset")).status).toBe(200);
    const afterA = (await (
      await request("/api/bootstrap", a.cookie)
    ).json()) as AppState;
    expect(
      afterA.projects.some((p) => p.name === "Visitor A private mutation"),
    ).toBe(true);
    expect(
      (await request("/api/bootstrap", "kit_demo=invalid-cookie")).status,
    ).toBe(401);
  });
  it("cleans expired sandboxes and preserves active visitors without a new signup", async () => {
    const expired = await visitor();
    now = new Date(now.getTime() + 3 * 3600_000);
    const active = await visitor();
    now = new Date(now.getTime() + 3 * 3600_000 + 1);
    await platform.cleanup();
    expect((await request("/api/bootstrap", expired.cookie)).status).toBe(401);
    expect((await request("/api/bootstrap", active.cookie)).status).toBe(200);
    const sessions = await platform.db.query("SELECT * FROM demo_sessions");
    expect(sessions.rows).toHaveLength(1);
    expect(
      (
        await platform.db.query("SELECT * FROM users WHERE id=$1", [
          expired.state.user.id,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await platform.db.query("SELECT * FROM organizations WHERE id=$1", [
          active.state.organization.id,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("limits reset by authenticated identity even with varied irrelevant cookies", async () => {
    const client = await visitor();
    for (let i = 0; i < 6; i++) {
      expect(
        (
          await request("/api/actions", `${client.cookie}; noise=${i}`, {
            action: "demo.reset",
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await request("/api/actions", `${client.cookie}; noise=last`, {
          action: "demo.reset",
        })
      ).status,
    ).toBe(429);
  });
  it("stores no invitation plaintext token in demo outbox", async () => {
    const client = await visitor();
    expect(
      (
        await action(client, "invitation.create", {
          email: "fictional@example.test",
          role: "VIEWER",
        })
      ).status,
    ).toBe(200);
    const outbox = await platform.db.query("SELECT body FROM dev_outbox");
    expect(JSON.stringify(outbox.rows)).not.toContain("token=");
    const invitation = await platform.db.query<{ token_hash: string }>(
      "SELECT token_hash FROM invitations",
    );
    expect(invitation.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
