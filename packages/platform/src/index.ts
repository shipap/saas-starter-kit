import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { createDatabase, type Database } from "../../db/src";
import { createAuth } from "../../auth/src";
import { MockBillingProvider, type BillingProvider } from "../../billing/src";
import { DevelopmentOutboxProvider } from "../../email/src";
import type { EmailProvider } from "../../email/src";
import type { AppState, PlatformState, Role } from "../../shared/src/types";
import {
  permissionsForRole,
  type Permission,
} from "../../shared/src/permissions";

type Row = Record<string, unknown>;
type Identity = {
  user: Row;
  demo: boolean;
  sandbox: Row | null;
  emailVerified: boolean;
};
type Context = Identity & { organization: Row; role: Role };
export interface PlatformOptions {
  demoMode?: boolean;
  publicDemo?: boolean;
  databasePath?: string;
  database?: Database;
  databaseDriver?: string;
  databaseUrl?: string;
  appUrl?: string;
  authSecret?: string;
  webhookSecret?: string;
  billingProvider?: BillingProvider;
  now?: () => Date;
  platformAdminUserIds?: string[];
  emailProvider?: EmailProvider;
}
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const roles = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
const inviteRoles = z.enum(["ADMIN", "MEMBER", "VIEWER"]);
const uuid = z.string().uuid();
const name = z.string().trim().min(2).max(80);
const slug = z
  .string()
  .min(2)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens.",
  );
const projectFields = z.object({
  name,
  description: z.string().trim().max(1000).default(""),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).default("ACTIVE"),
});
const iso = (value: unknown) => new Date(value as string | Date).toISOString();
const string = (value: unknown) => String(value);
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

export async function createPlatform(options: PlatformOptions = {}) {
  const demoMode = options.demoMode ?? process.env.DEMO_MODE === "true";
  const publicDemo = options.publicDemo ?? process.env.PUBLIC_DEMO === "true";
  if (publicDemo && !demoMode)
    throw new Error("PUBLIC_DEMO requires DEMO_MODE.");
  const appUrl =
    options.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const now = options.now ?? (() => new Date());
  const secret = options.authSecret ?? process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (
    process.env.NODE_ENV === "production" &&
    (!demoMode || publicDemo) &&
    !appUrl.startsWith("https://")
  )
    throw new Error("Normal production authentication requires HTTPS.");
  const driver =
    options.databaseDriver ?? process.env.DATABASE_DRIVER ?? "pglite";
  if (!["pglite", "postgres"].includes(driver))
    throw new Error("DATABASE_DRIVER must be pglite or postgres.");
  if (
    process.env.NODE_ENV === "production" &&
    (!demoMode || publicDemo) &&
    driver !== "postgres"
  )
    throw new Error("Normal production mode requires PostgreSQL.");
  const db =
    options.database ??
    (await createDatabase({
      driver,
      path: options.databasePath ?? process.env.DATABASE_PATH ?? ".data/demo",
      url: options.databaseUrl ?? process.env.DATABASE_URL,
    }));
  const auth = createAuth(db, {
    secret,
    appUrl,
    sendVerification: async (message) => {
      if (demoMode && new URL(appUrl).hostname === "localhost") {
        await db.query(
          "INSERT INTO auth_outbox(id,user_id,recipient,subject,body,created_at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            message.userId,
            message.email,
            "Verify your email",
            `Verify your account email: ${message.url}`,
            now(),
          ],
        );
        return;
      }
      if (!options.emailProvider)
        throw new Error(
          "A real email provider is required for normal account verification.",
        );
      await options.emailProvider.send({
        organizationId: "",
        to: message.email,
        subject: "Verify your email",
        text: `Verify your account email: ${message.url}`,
      });
    },
  });
  const billing =
    options.billingProvider ??
    new MockBillingProvider(
      options.webhookSecret ??
        process.env.MOCK_WEBHOOK_SECRET ??
        randomBytes(32).toString("hex"),
    );
  const limits = new Map<string, { count: number; expires: number }>();
  const admins =
    options.platformAdminUserIds ??
    (process.env.PLATFORM_ADMIN_USER_IDS ?? "").split(",").filter(Boolean);
  let lastCleanup = 0;
  function rate(key: string, maximum: number, window = 60_000) {
    const at = now().getTime();
    const item = limits.get(key);
    if (!item || item.expires <= at) {
      if (limits.size > 10_000)
        for (const [old, entry] of limits)
          if (entry.expires <= at) limits.delete(old);
      if (limits.size > 10_000)
        throw new HttpError(503, "LIMIT_CAPACITY", "Please retry shortly.");
      limits.set(key, { count: 1, expires: at + window });
      return;
    }
    item.count += 1;
    if (item.count > maximum)
      throw new HttpError(
        429,
        "RATE_LIMITED",
        "Too many requests. Please wait a minute.",
      );
  }
  async function row(
    sql: string,
    params: unknown[] = [],
    source = db,
  ): Promise<Row | undefined> {
    return (await source.query(sql, params)).rows[0];
  }
  async function audit(
    ctx: Context,
    event: string,
    target: string,
    source = db,
  ) {
    if (ctx.demo) {
      const count = await row(
        "SELECT count(*)::int AS count FROM audit_events WHERE organization_id=$1",
        [ctx.organization.id],
        source,
      );
      if (Number(count?.count) >= 5000)
        throw new HttpError(
          409,
          "RESOURCE_LIMIT",
          "Demo activity limit reached. Reset your sandbox to continue.",
        );
    }
    await source.query(
      "INSERT INTO audit_events(id,organization_id,actor,event,target,created_at) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        ctx.organization.id,
        ctx.user.name,
        event,
        target.slice(0, 150),
        now(),
      ],
    );
  }
  function requirePermission(ctx: Context, permission: Permission) {
    if (!permissionsForRole(ctx.role).includes(permission))
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Your role does not permit this action.",
      );
  }
  function requireDemo(identity: Identity) {
    if (!demoMode || !identity.demo || !identity.sandbox)
      throw new HttpError(
        403,
        "DEMO_ONLY",
        "This control is available only in a demo sandbox.",
      );
  }
  async function identity(request: Request): Promise<Identity> {
    const cookie = request.headers.get("cookie") ?? "";
    const token = cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("kit_demo="))
      ?.slice(9);
    if (token && demoMode) {
      const sandbox = await row(
        "SELECT * FROM demo_sessions WHERE token_hash=$1 AND expires_at>$2",
        [hash(token), now()],
      );
      if (sandbox) {
        const user = await row(
          "SELECT * FROM users WHERE id=$1 AND sandbox_id=$2",
          [sandbox.user_id, sandbox.id],
        );
        if (user) return { user, sandbox, demo: true, emailVerified: true };
      }
    }
    if (publicDemo)
      throw new HttpError(401, "UNAUTHENTICATED", "Start a demo to continue.");
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      throw new HttpError(
        401,
        "UNAUTHENTICATED",
        "Sign in or start a demo to continue.",
      );
    await db.query(
      "INSERT INTO users(id,name,email) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email",
      [session.user.id, session.user.name, session.user.email],
    );
    const user = await row(
      "SELECT * FROM users WHERE id=$1 AND sandbox_id IS NULL",
      [session.user.id],
    );
    if (!user)
      throw new HttpError(401, "UNAUTHENTICATED", "Invalid account session.");
    return {
      user,
      demo: false,
      sandbox: null,
      emailVerified: session.user.emailVerified,
    };
  }
  async function context(
    request: Request,
    organizationId?: string,
  ): Promise<Context> {
    const who = await identity(request);
    if (organizationId) uuid.parse(organizationId);
    const member = organizationId
      ? await row(
          "SELECT m.role,o.* FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND o.id=$2",
          [who.user.id, organizationId],
        )
      : await row(
          "SELECT m.role,o.* FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 ORDER BY o.created_at,o.id LIMIT 1",
          [who.user.id],
        );
    if (
      !member ||
      (who.demo && member.sandbox_id !== who.sandbox?.id) ||
      (!who.demo && member.sandbox_id !== null)
    )
      throw new HttpError(
        404,
        "WORKSPACE_NOT_FOUND",
        "Workspace not found or access denied.",
      );
    return {
      ...who,
      organization: member,
      role: who.demo ? (who.sandbox!.role as Role) : (member.role as Role),
    };
  }
  async function cleanup() {
    if (now().getTime() - lastCleanup < 60_000) return;
    lastCleanup = now().getTime();
    const expired = (
      await db.query(
        "SELECT id FROM demo_sessions WHERE expires_at<=$1 LIMIT 100",
        [now()],
      )
    ).rows;
    for (const item of expired)
      await db.transaction(async (tx) => {
        await tx.query("DELETE FROM organizations WHERE sandbox_id=$1", [
          item.id,
        ]);
        await tx.query("DELETE FROM users WHERE sandbox_id=$1", [item.id]);
        await tx.query("DELETE FROM demo_sessions WHERE id=$1", [item.id]);
      });
  }
  async function seed(sandboxId: string, ownerId: string, source: Database) {
    const stamp = now();
    const people = [
      {
        id: ownerId,
        name: "Alexander",
        email: "alexander@example.test",
        role: "OWNER",
      },
      {
        id: randomUUID(),
        name: "Sarah Chen",
        email: "sarah@example.test",
        role: "ADMIN",
      },
      {
        id: randomUUID(),
        name: "Marcus Reed",
        email: "marcus@example.test",
        role: "MEMBER",
      },
      {
        id: randomUUID(),
        name: "Elena Novak",
        email: "elena@example.test",
        role: "VIEWER",
      },
    ];
    for (const person of people)
      await source.query(
        "INSERT INTO users(id,name,email,sandbox_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email",
        [person.id, person.name, person.email, sandboxId],
      );
    for (const [index, title] of ["Acme Labs", "Northstar Studio"].entries()) {
      const organizationId = randomUUID();
      await source.query(
        "INSERT INTO organizations(id,name,slug,sandbox_id,plan,current_period_end,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          organizationId,
          title,
          index ? "northstar-studio" : "acme-labs",
          sandboxId,
          index ? "FREE" : "PRO",
          new Date(stamp.getTime() + 30 * 86400_000),
          new Date(stamp.getTime() + index),
        ],
      );
      for (const person of people)
        await source.query(
          "INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)",
          [randomUUID(), organizationId, person.id, person.role],
        );
      const projects = index
        ? [
            [
              "Developer Handbook",
              "A shared home for engineering decisions.",
              "ACTIVE",
            ],
          ]
        : [
            [
              "Customer Portal",
              "A secure self-service workspace for customers.",
              "ACTIVE",
            ],
            [
              "Billing Integration",
              "Subscription lifecycle and finance workflows.",
              "ACTIVE",
            ],
            [
              "Internal Automation",
              "Reduce repeated operational work with event-driven tools.",
              "PAUSED",
            ],
            [
              "Analytics Dashboard",
              "Clear reporting from existing product data.",
              "ACTIVE",
            ],
          ];
      for (const [i, project] of projects.entries()) {
        const id = randomUUID();
        const created = new Date(
          stamp.getTime() - (projects.length - i) * 86400_000,
        );
        await source.query(
          "INSERT INTO projects(id,organization_id,name,description,status,owner_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            organizationId,
            project[0],
            project[1],
            project[2],
            people[i % people.length]!.id,
            created,
          ],
        );
        await source.query(
          "INSERT INTO audit_events(id,organization_id,actor,event,target,created_at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            organizationId,
            people[i % people.length]!.name,
            "project.created",
            project[0],
            created,
          ],
        );
      }
      if (!index)
        for (let day = 6; day >= 0; day--)
          for (
            let request = 0;
            request < [4, 8, 7, 12, 9, 15, 11][6 - day]!;
            request++
          ) {
            await source.query(
              "INSERT INTO usage_events(id,organization_id,path,status,created_at) VALUES($1,$2,$3,$4,$5)",
              [
                randomUUID(),
                organizationId,
                "/api/v1/projects",
                200,
                new Date(stamp.getTime() - day * 86400_000 - request * 300_000),
              ],
            );
          }
      await new DevelopmentOutboxProvider(source, now).send({
        organizationId,
        to: "alexander@example.test",
        subject: `Welcome to ${title}`,
        text: "Your isolated demo workspace is ready. All names, activity, and usage records in this sandbox are fictional.",
      });
    }
  }
  async function startDemo(request: Request) {
    if (!demoMode)
      throw new HttpError(404, "NOT_FOUND", "Demo mode is disabled.");
    await cleanup();
    const cookie = request.headers.get("cookie") ?? "";
    const existingToken = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("kit_demo="))
      ?.slice(9);
    if (
      existingToken &&
      (await row(
        "SELECT id FROM demo_sessions WHERE token_hash=$1 AND expires_at>$2",
        [hash(existingToken), now()],
      ))
    )
      return json({ ok: true });
    rate("demo.creation.global", 20);
    const id = randomUUID(),
      ownerId = randomUUID(),
      token = randomBytes(32).toString("base64url");
    await db.transaction(async (tx) => {
      await tx.query("LOCK TABLE demo_sessions IN SHARE ROW EXCLUSIVE MODE");
      const count = await row(
        "SELECT count(*)::int AS count FROM demo_sessions",
        [],
        tx,
      );
      if (Number(count?.count) >= 200)
        throw new HttpError(
          503,
          "DEMO_CAPACITY",
          "Demo capacity reached. Try again after an existing sandbox expires.",
        );
      await seed(id, ownerId, tx);
      await tx.query(
        "INSERT INTO demo_sessions(id,token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          hash(token),
          ownerId,
          new Date(now().getTime() + 6 * 3600_000),
          now(),
        ],
      );
    });
    return json({ ok: true }, 200, {
      "Set-Cookie": `kit_demo=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=21600${appUrl.startsWith("https://") ? "; Secure" : ""}`,
    });
  }
  async function bootstrap(request: Request): Promise<AppState> {
    const orgId =
      new URL(request.url).searchParams.get("organizationId") ?? undefined;
    const ctx = await context(request, orgId);
    const org = ctx.organization;
    const permission = permissionsForRole(ctx.role);
    const organizations = (
      await db.query(
        "SELECT o.id,o.name,o.slug,m.role FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND o.sandbox_id IS NOT DISTINCT FROM $2 ORDER BY o.created_at",
        [ctx.user.id, ctx.demo ? ctx.sandbox!.id : null],
      )
    ).rows;
    const projects = (
      await db.query(
        "SELECT p.*,u.name AS owner_name FROM projects p LEFT JOIN users u ON u.id=p.owner_id WHERE p.organization_id=$1 ORDER BY p.created_at DESC",
        [org.id],
      )
    ).rows;
    const members = (
      await db.query(
        "SELECT m.id,m.user_id,m.role,u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'MEMBER' THEN 2 ELSE 3 END,u.name",
        [org.id],
      )
    ).rows;
    const invitations = (
      await db.query(
        "SELECT id,email,role,status,expires_at FROM invitations WHERE organization_id=$1 ORDER BY created_at DESC",
        [org.id],
      )
    ).rows;
    const keys = permission.includes("keys.read")
      ? (
          await db.query(
            "SELECT id,name,prefix,last_four,scopes,created_at,last_used_at,revoked_at FROM api_keys WHERE organization_id=$1 ORDER BY created_at DESC",
            [org.id],
          )
        ).rows
      : [];
    const usage = (
      await db.query(
        "SELECT id,path,status,created_at FROM usage_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 20",
        [org.id],
      )
    ).rows;
    const counts = await row(
      "SELECT count(*)::int AS total,count(*) FILTER(WHERE created_at>=date_trunc('month',$2::timestamptz))::int AS month FROM usage_events WHERE organization_id=$1",
      [org.id, now()],
    );
    const daily = new Map<string, number>();
    const today = new Date(`${now().toISOString().slice(0, 10)}T00:00:00Z`);
    for (let day = 6; day >= 0; day--)
      daily.set(
        new Date(today.getTime() - day * 86400_000).toISOString().slice(0, 10),
        0,
      );
    const dailyCounts = (
      await db.query(
        "SELECT (created_at AT TIME ZONE 'UTC')::date::text AS date,count(*)::int AS count FROM usage_events WHERE organization_id=$1 AND created_at >= $2 AND created_at < $3 GROUP BY (created_at AT TIME ZONE 'UTC')::date ORDER BY date",
        [
          org.id,
          new Date(today.getTime() - 6 * 86400_000),
          new Date(today.getTime() + 86400_000),
        ],
      )
    ).rows;
    for (const record of dailyCounts) {
      daily.set(string(record.date), Number(record.count));
    }
    const events = (
      await db.query(
        "SELECT id,actor,event,target,created_at FROM audit_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 250",
        [org.id],
      )
    ).rows;
    const outbox =
      ctx.demo && permission.includes("outbox.read")
        ? (
            await db.query(
              "SELECT * FROM dev_outbox WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",
              [org.id],
            )
          ).rows
        : [];
    return {
      user: {
        id: string(ctx.user.id),
        name: string(ctx.user.name),
        email: string(ctx.user.email),
        theme: ctx.user.theme as AppState["user"]["theme"],
      },
      demo: ctx.demo,
      sandboxExpiresAt: ctx.demo ? iso(ctx.sandbox!.expires_at) : null,
      organizations: organizations.map((o) => ({
        id: string(o.id),
        name: string(o.name),
        slug: string(o.slug),
        role: ctx.demo ? ctx.role : (o.role as Role),
      })),
      organization: {
        id: string(org.id),
        name: string(org.name),
        slug: string(org.slug),
        role: ctx.role,
      },
      permissions: permission,
      projects: projects.map((p) => ({
        id: string(p.id),
        name: string(p.name),
        description: string(p.description),
        status: p.status as AppState["projects"][number]["status"],
        ownerId: p.owner_id ? string(p.owner_id) : null,
        ownerName: string(p.owner_name ?? "Unassigned"),
        createdAt: iso(p.created_at),
      })),
      members: members.map((m) => ({
        id: string(m.id),
        userId: string(m.user_id),
        name: string(m.name),
        email: string(m.email),
        role: m.role as Role,
      })),
      invitations: invitations.map((i) => ({
        id: string(i.id),
        email: string(i.email),
        role: i.role as Role,
        status:
          i.status === "PENDING" &&
          new Date(i.expires_at as string).getTime() <= now().getTime()
            ? "EXPIRED"
            : string(i.status),
        expiresAt: iso(i.expires_at),
      })),
      apiKeys: keys.map((k) => ({
        id: string(k.id),
        name: string(k.name),
        prefix: string(k.prefix),
        lastFour: string(k.last_four),
        scopes: k.scopes as string[],
        createdAt: iso(k.created_at),
        lastUsedAt: k.last_used_at ? iso(k.last_used_at) : null,
        revokedAt: k.revoked_at ? iso(k.revoked_at) : null,
      })),
      usage: {
        totalRequests: Number(counts?.total),
        monthRequests: Number(counts?.month),
        daily: [...daily].map(([date, count]) => ({ date, count })),
        recent: usage.slice(0, 20).map((u) => ({
          id: string(u.id),
          path: string(u.path),
          status: Number(u.status),
          createdAt: iso(u.created_at),
        })),
      },
      audit: events.map((e) => ({
        id: string(e.id),
        actor: string(e.actor),
        event: string(e.event),
        target: string(e.target),
        createdAt: iso(e.created_at),
      })),
      billing: {
        plan: org.plan as AppState["billing"]["plan"],
        status: string(org.billing_status),
        cancelAtPeriodEnd: Boolean(org.cancel_at_period_end),
        currentPeriodEnd: iso(org.current_period_end),
      },
      outbox: outbox.map((o) => ({
        id: string(o.id),
        to: string(o.recipient),
        subject: string(o.subject),
        text: string(o.body),
        createdAt: iso(o.created_at),
        ...(o.invitation_id ? { invitationId: string(o.invitation_id) } : {}),
      })),
    };
  }
  async function body(request: Request) {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 65_536)
      throw new HttpError(413, "BODY_TOO_LARGE", "Request body exceeds 64 KB.");
    const reader = request.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 65_536) {
        await reader.cancel();
        throw new HttpError(
          413,
          "BODY_TOO_LARGE",
          "Request body exceeds 64 KB.",
        );
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function actions(request: Request, input: Record<string, unknown>) {
    const action = z.string().min(1).max(80).parse(input.action);
    const organizationId =
      input.organizationId === undefined
        ? undefined
        : uuid.parse(input.organizationId);
    if (action === "session.logout") {
      const token = (request.headers.get("cookie") ?? "")
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("kit_demo="))
        ?.slice(9);
      if (token)
        await db.query(
          "UPDATE demo_sessions SET expires_at=$1 WHERE token_hash=$2",
          [now(), hash(token)],
        );
      const response = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      });
      const headers = new Headers(response.headers);
      headers.append(
        "Set-Cookie",
        "kit_demo=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      );
      return Response.json({ ok: true }, { headers });
    }
    if (action === "organization.create") {
      const who = await identity(request);
      rate(`organization:${who.user.id}`, 10);
      const fields = z.object({ name, slug }).parse(input);
      const count = await row(
        "SELECT count(*)::int AS count FROM memberships WHERE user_id=$1",
        [who.user.id],
      );
      if (Number(count?.count) >= 10)
        throw new HttpError(
          409,
          "RESOURCE_LIMIT",
          "A demo account can belong to at most ten workspaces.",
        );
      if (who.demo && who.sandbox!.role !== "OWNER")
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the demo Owner can create a workspace.",
        );
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO organizations(id,name,slug,sandbox_id,current_period_end,created_at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id,
            fields.name,
            fields.slug,
            who.demo ? who.sandbox!.id : null,
            new Date(now().getTime() + 30 * 86400_000),
            now(),
          ],
        );
        await tx.query(
          "INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,'OWNER')",
          [randomUUID(), id, who.user.id],
        );
        await audit(
          { ...who, organization: { id }, role: "OWNER" },
          "organization.created",
          fields.name,
          tx,
        );
      });
      return json({ ok: true, organizationId: id });
    }
    if (action === "invitation.accept") {
      const who = await identity(request);
      const fields = z
        .object({ organizationId: uuid, token: z.string().min(20).max(200) })
        .parse(input);
      if (!who.emailVerified)
        throw new HttpError(
          403,
          "EMAIL_UNVERIFIED",
          "Verify your email before accepting an invitation.",
        );
      await acceptInvitation(who, fields.organizationId, fields.token);
      return json({ ok: true });
    }
    const ctx = await context(request, organizationId);
    rate(`action:${ctx.user.id}`, 120);
    if (action === "demo.reset") rate(`reset:${ctx.user.id}`, 6);
    if (action === "key.create" || action === "invitation.create")
      rate(`sensitive:${ctx.user.id}`, 20);
    const org = ctx.organization;
    if (action === "demo.role") {
      requireDemo(ctx);
      const role = roles.parse(input.role);
      await db.query("UPDATE demo_sessions SET role=$1 WHERE id=$2", [
        role,
        ctx.sandbox!.id,
      ]);
      return json({ ok: true });
    }
    if (action === "demo.reset") {
      requireDemo(ctx);
      await db.transaction(async (tx) => {
        await tx.query("DELETE FROM organizations WHERE sandbox_id=$1", [
          ctx.sandbox!.id,
        ]);
        await tx.query("DELETE FROM users WHERE sandbox_id=$1 AND id<>$2", [
          ctx.sandbox!.id,
          ctx.user.id,
        ]);
        await tx.query(
          "UPDATE users SET theme='system',name='Alexander' WHERE id=$1",
          [ctx.user.id],
        );
        await tx.query("UPDATE demo_sessions SET role='OWNER' WHERE id=$1", [
          ctx.sandbox!.id,
        ]);
        await seed(string(ctx.sandbox!.id), string(ctx.user.id), tx);
      });
      return json({ ok: true });
    }
    if (action === "account.update") {
      const fields = z
        .object({ name, theme: z.enum(["light", "dark", "system"]) })
        .parse(input);
      await db.query("UPDATE users SET name=$1,theme=$2 WHERE id=$3", [
        fields.name,
        fields.theme,
        ctx.user.id,
      ]);
      if (!ctx.demo)
        await auth.api.updateUser({
          headers: request.headers,
          body: { name: fields.name },
        });
      await audit(ctx, "account.updated", fields.name);
      return json({ ok: true });
    }
    if (action === "organization.update") {
      requirePermission(ctx, "organization.manage");
      const fields = z.object({ name, slug }).parse(input);
      await db.transaction(async (tx) => {
        await tx.query("UPDATE organizations SET name=$1,slug=$2 WHERE id=$3", [
          fields.name,
          fields.slug,
          org.id,
        ]);
        await audit(ctx, "organization.updated", fields.name, tx);
      });
      return json({ ok: true });
    }
    if (action === "organization.delete") {
      requirePermission(ctx, "organization.delete");
      if (input.confirmation !== org.name)
        throw new HttpError(
          400,
          "CONFIRMATION_REQUIRED",
          "Type the workspace name to confirm deletion.",
        );
      if (ctx.demo)
        throw new HttpError(
          409,
          "DEMO_PROTECTED",
          "Use Reset sandbox instead of deleting a demo workspace.",
        );
      await db.query("DELETE FROM organizations WHERE id=$1", [org.id]);
      return json({ ok: true });
    }
    if (action === "organization.leave") {
      requirePermission(ctx, "organization.leave");
      if (ctx.role === "OWNER" || ctx.organization.role === "OWNER")
        throw new HttpError(
          409,
          "OWNER_PROTECTED",
          "Transfer ownership before leaving this workspace.",
        );
      await db.transaction(async (tx) => {
        await tx.query(
          "DELETE FROM memberships WHERE organization_id=$1 AND user_id=$2",
          [org.id, ctx.user.id],
        );
        await audit(ctx, "member.left", string(ctx.user.name), tx);
      });
      return json({ ok: true });
    }
    if (action === "project.create" || action === "project.update") {
      requirePermission(ctx, "project.write");
      const fields = projectFields.parse(input);
      if (action === "project.create") {
        const count = await row(
          "SELECT count(*)::int AS count FROM projects WHERE organization_id=$1",
          [org.id],
        );
        if (Number(count?.count) >= 100)
          throw new HttpError(
            409,
            "RESOURCE_LIMIT",
            "Workspace project limit reached.",
          );
      }
      const id =
        action === "project.create" ? randomUUID() : uuid.parse(input.id);
      await db.transaction(async (tx) => {
        if (action === "project.create")
          await tx.query(
            "INSERT INTO projects(id,organization_id,name,description,status,owner_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              id,
              org.id,
              fields.name,
              fields.description,
              fields.status,
              ctx.user.id,
              now(),
            ],
          );
        else {
          const changed = await row(
            "UPDATE projects SET name=$1,description=$2,status=$3 WHERE id=$4 AND organization_id=$5 RETURNING id",
            [fields.name, fields.description, fields.status, id, org.id],
            tx,
          );
          if (!changed)
            throw new HttpError(
              404,
              "PROJECT_NOT_FOUND",
              "Project not found in this workspace.",
            );
        }
        await audit(
          ctx,
          fields.status === "ARCHIVED"
            ? "project.archived"
            : action === "project.create"
              ? "project.created"
              : "project.updated",
          fields.name,
          tx,
        );
      });
      return json({ ok: true, id });
    }
    if (action === "member.role" || action === "member.remove") {
      requirePermission(ctx, "team.manage");
      const id = uuid.parse(input.id);
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          org.id,
        ]);
        const member = await row(
          "SELECT m.*,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.id=$1 AND m.organization_id=$2 FOR UPDATE OF m",
          [id, org.id],
          tx,
        );
        if (!member)
          throw new HttpError(
            404,
            "MEMBER_NOT_FOUND",
            "Member not found in this workspace.",
          );
        if (member.role === "OWNER")
          throw new HttpError(
            ctx.role === "OWNER" ? 409 : 403,
            "OWNER_PROTECTED",
            "The workspace owner cannot be removed or demoted.",
          );
        if (action === "member.role") {
          const role = roles.parse(input.role);
          if (role === "OWNER")
            throw new HttpError(
              ctx.role === "OWNER" ? 409 : 403,
              "OWNER_PROTECTED",
              "Ownership transfer requires a dedicated verified flow.",
            );
          await tx.query(
            "UPDATE memberships SET role=$1 WHERE id=$2 AND organization_id=$3",
            [role, id, org.id],
          );
        } else
          await tx.query(
            "DELETE FROM memberships WHERE id=$1 AND organization_id=$2",
            [id, org.id],
          );
        await audit(
          ctx,
          action === "member.role" ? "member.role_changed" : "member.removed",
          string(member.name),
          tx,
        );
      });
      return json({ ok: true });
    }
    if (action === "invitation.create") {
      requirePermission(ctx, "team.manage");
      const fields = z
        .object({
          email: z
            .email()
            .max(254)
            .transform((value) => value.toLowerCase()),
          role: inviteRoles,
        })
        .parse(input);
      const id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          org.id,
        ]);
        const existing = await row(
          "SELECT id FROM invitations WHERE organization_id=$1 AND email=$2 AND status='PENDING' AND expires_at>$3",
          [org.id, fields.email, now()],
          tx,
        );
        if (existing)
          throw new HttpError(
            409,
            "DUPLICATE_INVITATION",
            "An active invitation already exists for this email.",
          );
        const member = await row(
          "SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND lower(u.email)=$2",
          [org.id, fields.email],
          tx,
        );
        if (member)
          throw new HttpError(
            409,
            "ALREADY_MEMBER",
            "This person already belongs to the workspace.",
          );
        const count = await row(
          "SELECT count(*)::int AS count FROM invitations WHERE organization_id=$1",
          [org.id],
          tx,
        );
        if (Number(count?.count) >= 100)
          throw new HttpError(
            409,
            "RESOURCE_LIMIT",
            "Invitation limit reached.",
          );
        await tx.query(
          "INSERT INTO invitations(id,organization_id,email,role,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            org.id,
            fields.email,
            fields.role,
            hash(token),
            new Date(now().getTime() + 7 * 86400_000),
            now(),
          ],
        );
        const message = {
          organizationId: string(org.id),
          to: fields.email,
          subject: `Invitation to ${org.name}`,
          text: ctx.demo
            ? `You have been invited as ${fields.role.toLowerCase()}. Open this invitation in your sandbox development outbox: ${appUrl}/app/team`
            : `You have been invited as ${fields.role.toLowerCase()}. Accept your invitation: ${appUrl}/invite?organizationId=${org.id}&token=${token}`,
          invitationId: id,
        };
        if (ctx.demo)
          await new DevelopmentOutboxProvider(tx, now).send(message);
        else {
          if (!options.emailProvider)
            throw new HttpError(
              503,
              "EMAIL_PROVIDER_REQUIRED",
              "Configure an email provider before inviting real users.",
            );
          await options.emailProvider.send(message);
        }
        await audit(ctx, "member.invited", fields.email, tx);
      });
      return json({ ok: true, id });
    }
    if (action === "invitation.revoke") {
      requirePermission(ctx, "team.manage");
      const id = uuid.parse(input.id);
      await db.transaction(async (tx) => {
        const invitation = await row(
          "UPDATE invitations SET status='REVOKED' WHERE id=$1 AND organization_id=$2 AND status='PENDING' RETURNING email",
          [id, org.id],
          tx,
        );
        if (!invitation)
          throw new HttpError(
            404,
            "INVITATION_NOT_FOUND",
            "Pending invitation not found.",
          );
        await audit(ctx, "invitation.revoked", string(invitation.email), tx);
      });
      return json({ ok: true });
    }
    if (action === "demo.invitation.accept") {
      requireDemo(ctx);
      requirePermission(ctx, "team.manage");
      const id = uuid.parse(input.id);
      await db.transaction(async (tx) => {
        const invite = await row(
          "SELECT * FROM invitations WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [id, org.id],
          tx,
        );
        checkInvitation(invite);
        const userId = randomUUID();
        await tx.query(
          "INSERT INTO users(id,name,email,sandbox_id) VALUES($1,$2,$3,$4)",
          [
            userId,
            string(invite!.email).split("@")[0],
            invite!.email,
            ctx.sandbox!.id,
          ],
        );
        await tx.query(
          "INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)",
          [randomUUID(), org.id, userId, invite!.role],
        );
        await tx.query("UPDATE invitations SET status='ACCEPTED' WHERE id=$1", [
          id,
        ]);
        await audit(ctx, "invitation.accepted", string(invite!.email), tx);
      });
      return json({ ok: true });
    }
    if (action === "key.create") {
      requirePermission(ctx, "keys.manage");
      const fields = z
        .object({
          name,
          scopes: z
            .array(z.enum(["projects:read", "events:write"]))
            .min(1)
            .max(2),
        })
        .parse(input);
      const count = await row(
        "SELECT count(*)::int AS count FROM api_keys WHERE organization_id=$1",
        [org.id],
      );
      if (Number(count?.count) >= 50)
        throw new HttpError(409, "RESOURCE_LIMIT", "API key limit reached.");
      const key = `sk_${ctx.demo ? "demo" : "live"}_${randomBytes(32).toString("base64url")}`,
        id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO api_keys(id,organization_id,name,prefix,last_four,key_hash,scopes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            id,
            org.id,
            fields.name,
            key.slice(0, 12),
            key.slice(-4),
            hash(key),
            JSON.stringify(fields.scopes),
            now(),
          ],
        );
        await audit(ctx, "api_key.created", fields.name, tx);
      });
      return json({ ok: true, key, id });
    }
    if (action === "key.revoke") {
      requirePermission(ctx, "keys.manage");
      const id = uuid.parse(input.id);
      await db.transaction(async (tx) => {
        const key = await row(
          "UPDATE api_keys SET revoked_at=$1 WHERE id=$2 AND organization_id=$3 AND revoked_at IS NULL RETURNING name",
          [now(), id, org.id],
          tx,
        );
        if (!key)
          throw new HttpError(
            404,
            "KEY_NOT_FOUND",
            "Active API key not found.",
          );
        await audit(ctx, "api_key.revoked", string(key.name), tx);
      });
      return json({ ok: true });
    }
    if (
      [
        "billing.plan",
        "billing.cancel",
        "billing.reactivate",
        "billing.simulate",
      ].includes(action)
    ) {
      requirePermission(ctx, "billing.manage");
      if (!ctx.demo || billing.name !== "mock")
        throw new HttpError(
          409,
          "BILLING_PROVIDER_REQUIRED",
          "Configure a production checkout adapter before changing a real subscription.",
        );
      const plan =
        action === "billing.plan"
          ? z.enum(["FREE", "PRO", "BUSINESS"]).parse(input.plan)
          : org.plan;
      const status =
        action === "billing.simulate"
          ? z
              .enum(["ACTIVE", "PAST_DUE", "CANCELED", "TRIALING"])
              .parse(input.status)
          : action === "billing.reactivate"
            ? "ACTIVE"
            : org.billing_status;
      const canceled =
        action === "billing.cancel"
          ? true
          : action === "billing.reactivate" || action === "billing.plan"
            ? false
            : org.cancel_at_period_end;
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE organizations SET plan=$1,billing_status=$2,cancel_at_period_end=$3 WHERE id=$4",
          [plan, status, canceled, org.id],
        );
        await audit(
          ctx,
          "billing.changed",
          `${plan} / ${status}${canceled ? " / cancellation scheduled" : ""}`,
          tx,
        );
        await new DevelopmentOutboxProvider(tx, now).send({
          organizationId: string(org.id),
          to: string(ctx.user.email),
          subject: "Demo subscription updated",
          text: `Plan: ${plan}. Status: ${status}. No payment was made.`,
        });
      });
      return json({ ok: true });
    }
    throw new HttpError(400, "UNKNOWN_ACTION", "This action is not supported.");
  }
  function checkInvitation(invitation: Row | undefined) {
    if (!invitation)
      throw new HttpError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
    if (invitation.status !== "PENDING")
      throw new HttpError(
        409,
        "INVITATION_UNAVAILABLE",
        "This invitation has already been accepted or revoked.",
      );
    if (new Date(invitation.expires_at as string).getTime() <= now().getTime())
      throw new HttpError(
        410,
        "INVITATION_EXPIRED",
        "This invitation has expired.",
      );
  }
  async function acceptInvitation(
    who: Identity,
    organizationId: string,
    token: string,
  ) {
    await db.transaction(async (tx) => {
      const invite = await row(
        "SELECT i.*,o.sandbox_id FROM invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.organization_id=$1 AND i.token_hash=$2 FOR UPDATE OF i",
        [organizationId, hash(token)],
        tx,
      );
      checkInvitation(invite);
      if (
        string(invite!.email).toLowerCase() !==
        string(who.user.email).toLowerCase()
      )
        throw new HttpError(
          403,
          "INVITATION_RECIPIENT_MISMATCH",
          "Sign in with the invited email address.",
        );
      if (
        (who.demo && invite!.sandbox_id !== who.sandbox!.id) ||
        (!who.demo && invite!.sandbox_id !== null)
      )
        throw new HttpError(
          404,
          "INVITATION_NOT_FOUND",
          "Invitation not found.",
        );
      await tx.query(
        "INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,user_id) DO NOTHING",
        [randomUUID(), organizationId, who.user.id, invite!.role],
      );
      await tx.query("UPDATE invitations SET status='ACCEPTED' WHERE id=$1", [
        invite!.id,
      ]);
      await audit(
        {
          ...who,
          organization: { id: organizationId },
          role: invite!.role as Role,
        },
        "invitation.accepted",
        string(who.user.email),
        tx,
      );
    });
  }
  async function apiProjects(request: Request) {
    rate("api.request.global", 1000);
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (\S+)$/)?.[1];
    if (!token || token.length > 200)
      throw new HttpError(
        401,
        "INVALID_API_KEY",
        "A valid Bearer API key is required.",
      );
    const key = await row(
      "SELECT k.*,o.sandbox_id FROM api_keys k JOIN organizations o ON o.id=k.organization_id WHERE k.key_hash=$1 AND k.revoked_at IS NULL",
      [hash(token)],
    );
    if (!key)
      throw new HttpError(
        401,
        "INVALID_API_KEY",
        "API key is invalid or revoked.",
      );
    if (
      key.sandbox_id &&
      !(await row(
        "SELECT id FROM demo_sessions WHERE id=$1 AND expires_at>$2",
        [key.sandbox_id, now()],
      ))
    )
      throw new HttpError(
        401,
        "INVALID_API_KEY",
        "This demo sandbox has expired.",
      );
    rate(`key:${key.id}`, 60);
    const requested = new URL(request.url).searchParams.get("organizationId");
    if (requested && requested !== key.organization_id)
      throw new HttpError(
        403,
        "TENANT_MISMATCH",
        "API keys can access only their own workspace.",
      );
    if (!(key.scopes as string[]).includes("projects:read"))
      throw new HttpError(
        403,
        "INSUFFICIENT_SCOPE",
        "This API key requires projects:read scope.",
      );
    await db.transaction(async (tx) => {
      await tx.query("UPDATE api_keys SET last_used_at=$1 WHERE id=$2", [
        now(),
        key.id,
      ]);
      await tx.query(
        "INSERT INTO usage_events(id,organization_id,key_id,path,status,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          key.organization_id,
          key.id,
          "/api/v1/projects",
          200,
          now(),
        ],
      );
    });
    const projects = (
      await db.query(
        "SELECT id,name,description,status,created_at FROM projects WHERE organization_id=$1 ORDER BY created_at DESC",
        [key.organization_id],
      )
    ).rows;
    return json({
      data: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        createdAt: iso(p.created_at),
      })),
      organizationId: key.organization_id,
    });
  }
  async function platform(request: Request): Promise<PlatformState> {
    const who = await identity(request);
    if (!who.demo && !admins.includes(string(who.user.id)))
      throw new HttpError(
        403,
        "PLATFORM_ADMIN_REQUIRED",
        "Platform administrator access is required.",
      );
    const scope = who.demo ? who.sandbox!.id : null;
    const users = (
      await db.query(
        who.demo
          ? "SELECT id,name,email FROM users WHERE sandbox_id=$1"
          : "SELECT id,name,email FROM users WHERE sandbox_id IS NULL LIMIT 500",
        who.demo ? [scope] : [],
      )
    ).rows;
    const organizations = (
      await db.query(
        who.demo
          ? "SELECT o.id,o.name,o.plan,count(m.id)::int AS member_count FROM organizations o LEFT JOIN memberships m ON m.organization_id=o.id WHERE o.sandbox_id=$1 GROUP BY o.id"
          : "SELECT o.id,o.name,o.plan,count(m.id)::int AS member_count FROM organizations o LEFT JOIN memberships m ON m.organization_id=o.id WHERE o.sandbox_id IS NULL GROUP BY o.id LIMIT 500",
        who.demo ? [scope] : [],
      )
    ).rows;
    const sessions = who.demo
      ? [who.sandbox!]
      : (
          await db.query(
            "SELECT id,expires_at,created_at FROM demo_sessions ORDER BY created_at DESC LIMIT 100",
          )
        ).rows;
    return {
      demo: who.demo,
      users: users.map((u) => ({
        id: string(u.id),
        name: string(u.name),
        email: string(u.email),
      })),
      organizations: organizations.map((o) => ({
        id: string(o.id),
        name: string(o.name),
        plan: o.plan as AppState["billing"]["plan"],
        memberCount: Number(o.member_count),
      })),
      sessions: sessions.map((s) => ({
        id: string(s.id),
        expiresAt: iso(s.expires_at),
        createdAt: iso(s.created_at),
      })),
      planDistribution: (["FREE", "PRO", "BUSINESS"] as const).map((plan) => ({
        plan,
        count: organizations.filter((o) => o.plan === plan).length,
      })),
    };
  }
  async function handleRequest(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url),
        path = url.pathname;
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        path !== "/api/billing/webhook"
      ) {
        if (request.headers.get("origin") !== new URL(appUrl).origin)
          throw new HttpError(
            403,
            "INVALID_ORIGIN",
            "Request origin is not allowed.",
          );
        rate(
          `mutation:${request.headers.get("cookie") ? hash(request.headers.get("cookie")!) : "anonymous"}`,
          120,
        );
      }
      if (
        publicDemo &&
        (path.startsWith("/api/auth/") || path === "/api/development/outbox")
      )
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Normal authentication is disabled on this public demo.",
        );
      if (path.startsWith("/api/auth/")) {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
          const bounded = await body(request);
          const response = await auth.handler(
            new Request(request.url, {
              method: request.method,
              headers: request.headers,
              body: bounded,
            }),
          );
          if (
            response.ok &&
            ["/api/auth/sign-in/email", "/api/auth/sign-up/email"].includes(
              path,
            )
          )
            response.headers.append(
              "Set-Cookie",
              "kit_demo=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
            );
          return response;
        }
        return await auth.handler(request);
      }
      if (path === "/api/health" && request.method === "GET") {
        await db.query("SELECT 1");
        return json({ ok: true, database: "postgresql-compatible", demoMode });
      }
      if (path === "/api/demo/start" && request.method === "POST")
        return await startDemo(request);
      if (path === "/api/bootstrap" && request.method === "GET")
        return json(await bootstrap(request));
      if (path === "/api/platform" && request.method === "GET")
        return json(await platform(request));
      if (path === "/api/development/outbox" && request.method === "GET") {
        if (!demoMode || new URL(appUrl).hostname !== "localhost")
          throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
        const who = await identity(request);
        const messages = (
          await db.query(
            "SELECT id,recipient,subject,body,created_at FROM auth_outbox WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
            [who.user.id],
          )
        ).rows;
        return json({
          messages: messages.map((m) => ({
            id: m.id,
            to: m.recipient,
            subject: m.subject,
            text: m.body,
            createdAt: iso(m.created_at),
          })),
        });
      }
      if (path === "/api/v1/projects" && request.method === "GET")
        return await apiProjects(request);
      if (path === "/api/actions" && request.method === "POST") {
        if (!request.headers.get("content-type")?.includes("application/json"))
          throw new HttpError(415, "JSON_REQUIRED", "Use application/json.");
        return await actions(
          request,
          z
            .record(z.string(), z.unknown())
            .parse(JSON.parse(await body(request))),
        );
      }
      if (path === "/api/billing/webhook" && request.method === "POST") {
        let event;
        try {
          event = billing.verifyWebhook(
            await body(request),
            request.headers.get(
              billing.name === "stripe"
                ? "stripe-signature"
                : "x-webhook-signature",
            ) ?? "",
          );
        } catch {
          throw new HttpError(
            400,
            "INVALID_WEBHOOK",
            "Webhook payload or signature is invalid.",
          );
        }
        const duplicate = await db.transaction(async (tx) => {
          const organization = await row(
            "SELECT * FROM organizations WHERE id=$1 FOR UPDATE",
            [event.organizationId],
            tx,
          );
          if (!organization)
            throw new HttpError(
              404,
              "WORKSPACE_NOT_FOUND",
              "Workspace not found.",
            );
          const previous = await row(
            "SELECT id FROM billing_events WHERE id=$1",
            [event.id],
            tx,
          );
          if (previous) return true;
          await tx.query(
            "INSERT INTO billing_events(id,organization_id,provider,created_at) VALUES($1,$2,$3,$4)",
            [event.id, event.organizationId, billing.name, now()],
          );
          await tx.query(
            "UPDATE organizations SET plan=$1,billing_status=$2,cancel_at_period_end=$3 WHERE id=$4",
            [
              event.plan,
              event.status,
              event.cancelAtPeriodEnd ?? false,
              event.organizationId,
            ],
          );
          await tx.query(
            "INSERT INTO audit_events(id,organization_id,actor,event,target,created_at) VALUES($1,$2,'Billing provider','billing.webhook',$3,$4)",
            [
              randomUUID(),
              event.organizationId,
              `${event.plan} / ${event.status}`,
              now(),
            ],
          );
          return false;
        });
        return json({ ok: true, duplicate });
      }
      throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      if (error instanceof z.ZodError)
        return json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: error.issues[0]?.message ?? "Invalid input.",
              field: error.issues[0]?.path.join("."),
            },
          },
          400,
        );
      if (error instanceof SyntaxError)
        return json(
          {
            error: {
              code: "INVALID_JSON",
              message: "Request body must contain valid JSON.",
            },
          },
          400,
        );
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "23505"
      )
        return json(
          {
            error: {
              code: "CONFLICT",
              message: "This value is already in use.",
            },
          },
          409,
        );
      console.error(
        JSON.stringify({
          level: "error",
          event: "request.failed",
          code: "INTERNAL_ERROR",
        }),
      );
      return json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to complete this request. Please try again.",
          },
        },
        500,
      );
    }
  }
  const cleanupTimer = demoMode
    ? setInterval(() => {
        cleanup().catch(() =>
          console.error(
            JSON.stringify({ level: "error", event: "demo.cleanup.failed" }),
          ),
        );
      }, 60_000)
    : undefined;
  cleanupTimer?.unref();
  return {
    handleRequest,
    db,
    cleanup,
    close: () => {
      if (cleanupTimer) clearInterval(cleanupTimer);
      return db.close();
    },
  };
}
