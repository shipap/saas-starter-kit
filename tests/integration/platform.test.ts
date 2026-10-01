import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlatform } from "../../packages/platform/src/index";
import type { AppState } from "../../packages/shared/src/types";

const origin = "http://localhost:3000";
const secret = "test-webhook-secret";
let platform: Awaited<ReturnType<typeof createPlatform>>;
let now = new Date("2026-10-01T12:00:00Z");
type Client = { cookie: string; state: AppState };
async function request(
  path: string,
  cookie = "",
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  headers: Record<string, string> = {},
) {
  return platform.handleRequest(
    new Request(`${origin}${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
async function start(): Promise<Client> {
  const response = await request("/api/demo/start", "", {});
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const stateResponse = await request("/api/bootstrap", cookie);
  expect(stateResponse.status).toBe(200);
  return { cookie, state: (await stateResponse.json()) as AppState };
}
async function action(
  client: Client,
  actionName: string,
  fields: Record<string, unknown> = {},
  organizationId = client.state.organization.id,
) {
  return request("/api/actions", client.cookie, {
    action: actionName,
    organizationId,
    ...fields,
  });
}
async function refresh(client: Client) {
  const response = await request(
    `/api/bootstrap?organizationId=${client.state.organization.id}`,
    client.cookie,
  );
  expect(response.status).toBe(200);
  client.state = (await response.json()) as AppState;
  return client.state;
}
async function role(client: Client, value: string) {
  expect((await action(client, "demo.role", { role: value })).status).toBe(200);
}
beforeEach(async () => {
  now = new Date("2026-10-01T12:00:00Z");
  platform = await createPlatform({
    demoMode: true,
    databasePath: "memory://",
    appUrl: origin,
    authSecret: "test-secret-at-least-32-characters",
    webhookSecret: secret,
    now: () => now,
  });
});
afterEach(async () => {
  await platform.close();
});

describe("isolated demo sessions", () => {
  it("creates separate tenant data and HttpOnly sessions", async () => {
    const first = await start();
    const second = await start();
    expect(first.state.organization.id).not.toBe(second.state.organization.id);
    expect(first.cookie).not.toBe(second.cookie);
    const response = await request("/api/demo/start", "", {});
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(first.state.projects).toHaveLength(4);
    expect(first.state.members).toHaveLength(4);
  });
  it("requires authentication", async () => {
    expect((await request("/api/bootstrap")).status).toBe(401);
  });
  it("rejects foreign Origin on mutations", async () => {
    const client = await start();
    expect(
      (
        await request(
          "/api/actions",
          client.cookie,
          {
            action: "demo.reset",
            organizationId: client.state.organization.id,
          },
          "POST",
          { Origin: "https://evil.invalid" },
        )
      ).status,
    ).toBe(403);
  });
  it("resets only the current sandbox", async () => {
    const a = await start();
    const b = await start();
    expect(
      (
        await action(a, "project.create", {
          name: "Temporary",
          description: "Test",
          status: "ACTIVE",
        })
      ).status,
    ).toBe(200);
    expect((await action(a, "demo.reset")).status).toBe(200);
    a.state = (await (
      await request("/api/bootstrap", a.cookie)
    ).json()) as AppState;
    expect(a.state.projects).toHaveLength(4);
    expect((await refresh(b)).projects).toHaveLength(4);
  });
  it("expires a sandbox session", async () => {
    const client = await start();
    now = new Date("2026-10-20T12:00:00Z");
    expect((await request("/api/bootstrap", client.cookie)).status).toBe(401);
    now = new Date("2026-10-01T12:00:00Z");
  });
});

describe("server tenant isolation", () => {
  for (const resource of ["project", "member", "key", "audit", "settings"])
    it(`denies access to another tenant's ${resource}`, async () => {
      const a = await start();
      const b = await start();
      if (resource === "project")
        expect(
          (
            await action(
              a,
              "project.update",
              {
                id: b.state.projects[0].id,
                name: "Intrusion",
                description: "",
                status: "ARCHIVED",
              },
              b.state.organization.id,
            )
          ).status,
        ).toBeGreaterThanOrEqual(403);
      if (resource === "member")
        expect(
          (
            await action(
              a,
              "member.remove",
              { id: b.state.members[1].id },
              b.state.organization.id,
            )
          ).status,
        ).toBeGreaterThanOrEqual(403);
      if (resource === "key")
        expect(
          (
            await action(
              a,
              "key.create",
              { name: "Intrusion", scopes: ["projects:read"] },
              b.state.organization.id,
            )
          ).status,
        ).toBeGreaterThanOrEqual(403);
      if (resource === "audit")
        expect(
          (
            await request(
              `/api/bootstrap?organizationId=${b.state.organization.id}`,
              a.cookie,
            )
          ).status,
        ).toBeGreaterThanOrEqual(403);
      if (resource === "settings")
        expect(
          (
            await action(
              a,
              "organization.update",
              { name: "Intrusion", slug: "intrusion" },
              b.state.organization.id,
            )
          ).status,
        ).toBeGreaterThanOrEqual(403);
      expect((await refresh(b)).organization.name).toBe(
        b.state.organization.name,
      );
    });
  it("rejects foreign resource IDs inside a permitted tenant", async () => {
    const a = await start();
    const b = await start();
    expect(
      (
        await action(a, "project.update", {
          id: b.state.projects[0].id,
          name: "Intrusion",
          description: "",
          status: "ARCHIVED",
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (await action(a, "member.remove", { id: b.state.members[1].id })).status,
    ).toBeGreaterThanOrEqual(400);
  });
});

describe("centralized server RBAC", () => {
  for (const value of ["OWNER", "ADMIN", "MEMBER", "VIEWER"])
    it(`enforces ${value} permissions`, async () => {
      const client = await start();
      await role(client, value);
      const project = await action(client, "project.create", {
        name: "Role test",
        description: "",
        status: "ACTIVE",
      });
      expect(project.status).toBe(value === "VIEWER" ? 403 : 200);
      const invite = await action(client, "invitation.create", {
        email: `${value.toLowerCase()}@example.invalid`,
        role: "MEMBER",
      });
      expect(invite.status).toBe(
        ["OWNER", "ADMIN"].includes(value) ? 200 : 403,
      );
      const billing = await action(client, "billing.plan", {
        plan: "BUSINESS",
      });
      expect(billing.status).toBe(value === "OWNER" ? 200 : 403);
      const key = await action(client, "key.create", {
        name: "Role key",
        scopes: ["projects:read"],
      });
      expect(key.status).toBe(["OWNER", "ADMIN"].includes(value) ? 200 : 403);
      const settings = await action(client, "organization.update", {
        name: "Role workspace",
        slug: "role-workspace",
      });
      expect(settings.status).toBe(
        ["OWNER", "ADMIN"].includes(value) ? 200 : 403,
      );
      if (value !== "OWNER")
        expect(
          (
            await action(client, "organization.delete", {
              confirmation: client.state.organization.name,
            })
          ).status,
        ).toBe(403);
    });
  it("protects the last owner from leaving or removing ownership", async () => {
    const client = await start();
    expect(
      (await action(client, "organization.leave")).status,
    ).toBeGreaterThanOrEqual(400);
    const owner = client.state.members.find(
      (member) => member.role === "OWNER",
    )!;
    expect(
      (await action(client, "member.remove", { id: owner.id })).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (await action(client, "member.role", { id: owner.id, role: "VIEWER" }))
        .status,
    ).toBeGreaterThanOrEqual(400);
  });
  it("prevents admins assigning ownership", async () => {
    const client = await start();
    await role(client, "ADMIN");
    expect(
      (
        await action(client, "member.role", {
          id: client.state.members[2].id,
          role: "OWNER",
        })
      ).status,
    ).toBe(403);
  });
});

describe("API key lifecycle", () => {
  it("rejects revoking another tenant's key even with a valid local membership", async () => {
    const a = await start();
    const b = await start();
    await action(b, "key.create", {
      name: "Protected",
      scopes: ["projects:read"],
    });
    await refresh(b);
    const key = b.state.apiKeys.find((item) => item.name === "Protected")!;
    expect(
      (await action(a, "key.revoke", { id: key.id })).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (await refresh(b)).apiKeys.find((item) => item.id === key.id)!.revokedAt,
    ).toBeNull();
  });
  it("reveals a random key once, stores hashes, enforces tenant scope and revocation", async () => {
    const a = await start();
    const b = await start();
    const response = await action(a, "key.create", {
      name: "Integration",
      scopes: ["projects:read"],
    });
    expect(response.status).toBe(200);
    const { key } = (await response.json()) as { key: string };
    expect(key.length).toBeGreaterThan(32);
    const state = await refresh(a);
    expect(JSON.stringify(state.apiKeys)).not.toContain(key);
    const stored = await platform.db.query<{ key_hash: string }>(
      "SELECT key_hash FROM api_keys WHERE organization_id = $1",
      [a.state.organization.id],
    );
    expect(stored.rows.some((row) => row.key_hash === key)).toBe(false);
    expect(stored.rows.every((row) => row.key_hash.length >= 32)).toBe(true);
    const valid = await request("/api/v1/projects", "", undefined, "GET", {
      Authorization: `Bearer ${key}`,
    });
    expect(valid.status).toBe(200);
    expect(
      (
        await request(
          `/api/v1/projects?organizationId=${b.state.organization.id}`,
          "",
          undefined,
          "GET",
          { Authorization: `Bearer ${key}` },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/v1/projects", "", undefined, "GET", {
          Authorization: "Bearer invalid-key",
        })
      ).status,
    ).toBe(401);
    const id = state.apiKeys.find((item) => item.name === "Integration")!.id;
    expect((await action(a, "key.revoke", { id })).status).toBe(200);
    expect(
      (
        await request("/api/v1/projects", "", undefined, "GET", {
          Authorization: `Bearer ${key}`,
        })
      ).status,
    ).toBe(401);
    expect((await refresh(a)).usage.totalRequests).toBeGreaterThan(
      a.state.usage.totalRequests - 1,
    );
  });
  it("rejects missing read scope", async () => {
    const client = await start();
    const response = await action(client, "key.create", {
      name: "No read",
      scopes: ["events:write"],
    });
    if (response.status === 200) {
      const { key } = (await response.json()) as { key: string };
      expect(
        (
          await request("/api/v1/projects", "", undefined, "GET", {
            Authorization: `Bearer ${key}`,
          })
        ).status,
      ).toBe(403);
    } else expect(response.status).toBe(400);
  });
});

describe("safe audit events and input validation", () => {
  it("aggregates all recorded usage when recent events are capped", async () => {
    const client = await start();
    const today = "2026-10-01";
    const priorDaily = client.state.usage.daily.find(
      (item) => item.date === today,
    )!.count;
    const priorTotal = client.state.usage.totalRequests;
    const priorMonth = client.state.usage.monthRequests;
    await platform.db.query(
      "INSERT INTO usage_events(id,organization_id,path,status,created_at) SELECT 'usage-regression-'||n::text,$1,'/api/v1/projects',200,$2 FROM generate_series(1,1005) AS n",
      [client.state.organization.id, now],
    );
    const state = await refresh(client);
    expect(state.usage.totalRequests).toBe(priorTotal + 1005);
    expect(state.usage.monthRequests).toBe(priorMonth + 1005);
    expect(state.usage.daily.find((item) => item.date === today)!.count).toBe(
      priorDaily + 1005,
    );
    expect(state.usage.recent).toHaveLength(20);
  });
  it("records important changes without credentials or plaintext tokens", async () => {
    const client = await start();
    await action(client, "project.create", {
      name: "Audited project",
      description: "",
      status: "ACTIVE",
    });
    const keyResponse = await action(client, "key.create", {
      name: "Audited key",
      scopes: ["projects:read"],
    });
    const { key } = (await keyResponse.json()) as { key: string };
    await action(client, "invitation.create", {
      email: "audit-recipient@example.invalid",
      role: "VIEWER",
    });
    await action(client, "billing.plan", { plan: "BUSINESS" });
    const state = await refresh(client);
    const serialized = JSON.stringify(state.audit);
    expect(serialized).toContain("Audited project");
    expect(serialized).not.toContain(key);
    expect(serialized).not.toMatch(
      /token_hash|key_hash|password|Bearer|token=/i,
    );
    expect(state.audit.length).toBeGreaterThan(client.state.projects.length);
  });
  it("treats SQL-looking names as ordinary data", async () => {
    const client = await start();
    const name = "Project'); DROP TABLE projects; --";
    expect(
      (
        await action(client, "project.create", {
          name,
          description: "Fictional test input",
          status: "ACTIVE",
        })
      ).status,
    ).toBe(200);
    expect(
      (await refresh(client)).projects.some((project) => project.name === name),
    ).toBe(true);
  });
  it("rejects invalid action fields and unknown actions", async () => {
    const client = await start();
    expect(
      (await action(client, "project.create", { name: "", status: "UNKNOWN" }))
        .status,
    ).toBe(400);
    expect((await action(client, "unknown.action")).status).toBe(400);
    expect(
      (
        await action(client, "account.update", {
          name: "Test",
          theme: "invalid",
        })
      ).status,
    ).toBe(400);
  });
  it("platform demo exposes only the caller's sandbox", async () => {
    const a = await start();
    const b = await start();
    const response = await request("/api/platform", a.cookie);
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain(b.state.organization.id);
    expect(serialized).not.toContain("token_hash");
    expect(serialized).not.toContain("key_hash");
  });
});

describe("mock billing and secure events", () => {
  it("supports upgrades, downgrades, cancellation and reactivation", async () => {
    const client = await start();
    for (const plan of ["FREE", "PRO", "BUSINESS", "PRO"]) {
      expect((await action(client, "billing.plan", { plan })).status).toBe(200);
      expect((await refresh(client)).billing.plan).toBe(plan);
    }
    expect((await action(client, "billing.cancel")).status).toBe(200);
    expect((await refresh(client)).billing.cancelAtPeriodEnd).toBe(true);
    expect((await action(client, "billing.reactivate")).status).toBe(200);
    expect((await refresh(client)).billing.cancelAtPeriodEnd).toBe(false);
  });
  it("rejects invalid signatures and deduplicates valid webhook replay", async () => {
    const client = await start();
    const body = {
      id: "evt-test-idempotent",
      organizationId: client.state.organization.id,
      plan: "BUSINESS",
      status: "ACTIVE",
    };
    expect(
      (
        await request("/api/billing/webhook", "", body, "POST", {
          "x-webhook-signature": "invalid",
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    const signature = createHmac("sha256", secret)
      .update(JSON.stringify(body))
      .digest("hex");
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request("/api/billing/webhook", "", body, "POST", {
            "x-webhook-signature": signature,
          })
        ).status,
      ).toBe(200);
    const stored = await platform.db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM billing_events WHERE id = $1",
      [body.id],
    );
    expect(stored.rows[0].count).toBe(1);
    expect((await refresh(client)).billing.plan).toBe("BUSINESS");
  });
});
