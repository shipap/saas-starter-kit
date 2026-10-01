import { randomUUID } from "node:crypto";
import type { Database } from "../../db/src";
export interface EmailMessage {
  organizationId: string;
  to: string;
  subject: string;
  text: string;
  invitationId?: string;
}
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
export class DevelopmentOutboxProvider implements EmailProvider {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date,
  ) {}
  async send(message: EmailMessage) {
    const count =
      (
        await this.db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM dev_outbox WHERE organization_id=$1",
          [message.organizationId],
        )
      ).rows[0]?.count ?? 0;
    if (count >= 500)
      throw new Error("Development outbox limit reached. Reset the sandbox.");
    await this.db.query(
      "INSERT INTO dev_outbox(id,organization_id,recipient,subject,body,invitation_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        message.organizationId,
        message.to,
        message.subject,
        message.text,
        message.invitationId ?? null,
        this.now(),
      ],
    );
  }
}
