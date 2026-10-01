import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlatform } from "../../packages/platform/src/index";
import type { AppState } from "../../packages/shared/src/types";

const origin = "http://localhost:3000";
let platform: Awaited<ReturnType<typeof createPlatform>>;
const now = new Date("2026-10-01T12:00:00Z");
async function request(path: string, cookie = "", body?: unknown) {
  return platform.handleRequest(
    new Request(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
async function start() {
  const response = await request("/api/demo/start", "", {});
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const state = (await (
    await request("/api/bootstrap", cookie)
  ).json()) as AppState;
  return { cookie, state };
}
async function invite(email: string) {
  const client = await start();
  const response = await request("/api/actions", client.cookie, {
    action: "invitation.create",
    organizationId: client.state.organization.id,
    email,
    role: "MEMBER",
  });
  expect(response.status).toBe(200);
  client.state = (await (
    await request("/api/bootstrap", client.cookie)
  ).json()) as AppState;
  const invitation = client.state.invitations.find(
    (item) => item.email === email,
  )!;
  expect(invitation).toBeDefined();
  return { ...client, invitation };
}
beforeAll(async () => {
  platform = await createPlatform({
    demoMode: true,
    databasePath: "memory://",
    appUrl: origin,
    authSecret: "test-secret-at-least-32-characters",
    now: () => now,
  });
});
afterAll(async () => {
  await platform.close();
});

describe("one-time expiring invitations", () => {
  it("delivers a development email and keeps plaintext tokens out of audit/bootstrap metadata", async () => {
    const client = await invite("invitee@example.invalid");
    const email = client.state.outbox.find(
      (item) => item.to === "invitee@example.invalid",
    )!;
    expect(email).toBeDefined();
    expect(email.text).toContain("http");
    const hashes = await platform.db.query<{ token_hash: string }>(
      "SELECT token_hash FROM invitations WHERE id=$1",
      [client.invitation.id],
    );
    expect(hashes.rows[0].token_hash.length).toBeGreaterThanOrEqual(32);
    expect(email.text).not.toContain("token=");
    expect(email.invitationId).toBe(client.invitation.id);
    const persisted = await platform.db.query<{ body: string }>(
      "SELECT body FROM dev_outbox WHERE invitation_id=$1",
      [client.invitation.id],
    );
    expect(persisted.rows[0].body).not.toContain("token=");
    expect(JSON.stringify(client.state.invitations)).not.toContain(
      "token_hash",
    );
    expect(JSON.stringify(client.state.audit)).not.toContain(
      hashes.rows[0].token_hash,
    );
    expect(JSON.stringify(client.state.audit)).not.toContain("token=");
  });
  it("prevents duplicate active invitation", async () => {
    const client = await invite("duplicate@example.invalid");
    const response = await request("/api/actions", client.cookie, {
      action: "invitation.create",
      organizationId: client.state.organization.id,
      email: "duplicate@example.invalid",
      role: "VIEWER",
    });
    expect(response.status).toBe(409);
  });
  it("accepts a valid demo invitation exactly once", async () => {
    const client = await invite("new-member@example.invalid");
    const body = {
      action: "demo.invitation.accept",
      organizationId: client.state.organization.id,
      id: client.invitation.id,
    };
    expect((await request("/api/actions", client.cookie, body)).status).toBe(
      200,
    );
    expect(
      (await request("/api/actions", client.cookie, body)).status,
    ).toBeGreaterThanOrEqual(400);
  });
  it("rejects revoked invitations", async () => {
    const client = await invite("revoked@example.invalid");
    const base = {
      organizationId: client.state.organization.id,
      id: client.invitation.id,
    };
    expect(
      (
        await request("/api/actions", client.cookie, {
          ...base,
          action: "invitation.revoke",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/actions", client.cookie, {
          ...base,
          action: "demo.invitation.accept",
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });
  it("rejects expired invitations", async () => {
    const client = await invite("expired@example.invalid");
    await platform.db.query(
      "UPDATE invitations SET expires_at=$1 WHERE id=$2",
      [new Date("2026-09-01T12:00:00Z"), client.invitation.id],
    );
    expect(
      (
        await request("/api/actions", client.cookie, {
          action: "demo.invitation.accept",
          organizationId: client.state.organization.id,
          id: client.invitation.id,
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });
  it("rejects wrong-organization invitation acceptance", async () => {
    const client = await invite("foreign@example.invalid");
    const stranger = await start();
    expect(
      (
        await request("/api/actions", stranger.cookie, {
          action: "demo.invitation.accept",
          organizationId: stranger.state.organization.id,
          id: client.invitation.id,
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });
});

describe("production-mode boundaries and real normal auth", () => {
  it("allows a specifically configured real platform administrator", async () => {
    const signup = await request("/api/auth/sign-up/email", "", {
      email: "platform-admin@example.invalid",
      password: "Fictional-Platform-Password-2048!",
      name: "Platform Test",
    });
    expect(signup.status).toBe(200);
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    const data = (await signup.json()) as { user: { id: string } };
    expect((await request("/api/platform", cookie)).status).toBe(403);
    const authorized = await createPlatform({
      database: platform.db,
      demoMode: false,
      appUrl: origin,
      authSecret: "test-secret-at-least-32-characters",
      platformAdminUserIds: [data.user.id],
    });
    const response = await authorized.handleRequest(
      new Request(`${origin}/api/platform`, {
        headers: { Cookie: cookie, Origin: origin },
      }),
    );
    expect(response.status).toBe(200);
    const overview = (await response.json()) as {
      demo: boolean;
      users: { id: string }[];
    };
    expect(overview.demo).toBe(false);
    expect(overview.users.some((user) => user.id === data.user.id)).toBe(true);
    expect(JSON.stringify(overview)).not.toMatch(
      /token_hash|key_hash|password/,
    );
    expect((await request("/api/platform", cookie)).status).toBe(403);
  });
  it("disables sandbox entry, role changes, resets and platform demo without DEMO_MODE", async () => {
    const normal = await createPlatform({
      demoMode: false,
      databasePath: "memory://",
      appUrl: origin,
      authSecret: "test-secret-at-least-32-characters",
    });
    try {
      const send = (path: string, body?: unknown) =>
        normal.handleRequest(
          new Request(`${origin}${path}`, {
            method: body ? "POST" : "GET",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          }),
        );
      expect((await send("/api/demo/start", {})).status).toBeGreaterThanOrEqual(
        400,
      );
      expect((await send("/api/platform")).status).toBeGreaterThanOrEqual(400);
      for (const action of [
        "demo.role",
        "demo.reset",
        "demo.invitation.accept",
      ])
        expect(
          (await send("/api/actions", { action, role: "OWNER" })).status,
        ).toBeGreaterThanOrEqual(400);
    } finally {
      await normal.close();
    }
  });
  it("registers, logs out and signs in using Better Auth email/password", async () => {
    const email = "auth-test@example.invalid";
    const credentials = {
      email,
      password: "Fictional-Test-Password-2048!",
      name: "Test Account",
    };
    const signup = await request("/api/auth/sign-up/email", "", credentials);
    expect(signup.status).toBe(200);
    const passwordRows = await platform.db.query<{ password: string }>(
      "SELECT a.password FROM auth_account a JOIN auth_user u ON u.id=a.user_id WHERE u.email=$1",
      [email],
    );
    expect(passwordRows.rows).toHaveLength(1);
    expect(passwordRows.rows[0].password).not.toBe(credentials.password);
    expect(passwordRows.rows[0].password.length).toBeGreaterThan(32);
    const cookie = signup.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).not.toBe("");
    const session = await request("/api/auth/get-session", cookie);
    expect(session.status).toBe(200);
    expect((await session.json()).user.email).toBe(email);
    expect((await request("/api/auth/sign-out", cookie, {})).status).toBe(200);
    expect(
      await (await request("/api/auth/get-session", cookie)).json(),
    ).toBeNull();
    const login = await request("/api/auth/sign-in/email", "", credentials);
    expect(login.status).toBe(200);
    const normalCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect((await request("/api/platform", normalCookie)).status).toBe(403);
    const created = await request("/api/actions", normalCookie, {
      action: "organization.create",
      name: "Normal auth workspace",
      slug: "normal-auth-workspace",
    });
    expect(created.status).toBe(200);
    const { organizationId } = (await created.json()) as {
      organizationId: string;
    };
    for (const action of ["demo.role", "demo.reset"])
      expect(
        (
          await request("/api/actions", normalCookie, {
            action,
            organizationId,
            role: "OWNER",
          })
        ).status,
      ).toBe(403);
    const wrong = await request("/api/auth/sign-in/email", "", {
      email,
      password: "Incorrect-Password-2048!",
    });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
  });
});
