import { expect, it } from "vitest";
import { createPlatform } from "../../packages/platform/src";
import type { EmailMessage } from "../../packages/email/src";

it("accepts a normal invitation only for its verified recipient and consumes its token", async () => {
  const origin = "http://localhost:3000";
  const messages: EmailMessage[] = [];
  const platform = await createPlatform({
    demoMode: true,
    databasePath: "memory://",
    appUrl: origin,
    authSecret: "test-only-authentication-secret-32-characters",
    emailProvider: {
      send: async (message) => {
        messages.push(message);
      },
    },
  });
  const send = (path: string, cookie: string, body?: unknown) =>
    platform.handleRequest(
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
  async function account(email: string) {
    const response = await send("/api/auth/sign-up/email", "", {
      email,
      name: "Fictional account",
      password: "Fixture-Password-For-Tests-2026!",
    });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")!.split(";")[0];
  }
  async function verify(cookie: string) {
    const outbox = await send("/api/development/outbox", cookie);
    const { messages: mail } = (await outbox.json()) as {
      messages: { text: string }[];
    };
    const url = new URL(mail[0].text.match(/https?:\/\/\S+/)![0]);
    const response = await send(`${url.pathname}${url.search}`, cookie);
    expect(response.status).toBeLessThan(400);
  }
  try {
    const owner = await account("owner-invitation@example.invalid");
    const recipient = await account("recipient-invitation@example.invalid");
    const stranger = await account("stranger-invitation@example.invalid");
    const created = await send("/api/actions", owner, {
      action: "organization.create",
      name: "Invitation fixture",
      slug: "invitation-fixture",
    });
    expect(created.status).toBe(200);
    const { organizationId } = (await created.json()) as {
      organizationId: string;
    };
    expect(
      (
        await send("/api/actions", owner, {
          action: "invitation.create",
          organizationId,
          email: "recipient-invitation@example.invalid",
          role: "MEMBER",
        })
      ).status,
    ).toBe(200);
    const delivered = new URL(messages[0].text.match(/https?:\/\/\S+/)![0]);
    const action = {
      action: "invitation.accept",
      organizationId,
      token: delivered.searchParams.get("token"),
    };
    expect((await send("/api/actions", recipient, action)).status).toBe(403);
    await verify(stranger);
    expect((await send("/api/actions", stranger, action)).status).toBe(403);
    await verify(recipient);
    expect((await send("/api/actions", recipient, action)).status).toBe(200);
    const state = await send(
      `/api/bootstrap?organizationId=${organizationId}`,
      recipient,
    );
    expect(state.status).toBe(200);
    expect((await state.json()).organization.role).toBe("MEMBER");
    expect(
      (await send("/api/actions", recipient, action)).status,
    ).toBeGreaterThanOrEqual(400);
  } finally {
    await platform.close();
  }
});
