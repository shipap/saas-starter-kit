import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import type { Plan } from "../../shared/src/types";

export const billingEventSchema = z.object({
  id: z.string().min(1).max(200),
  organizationId: z.string().uuid(),
  plan: z.enum(["FREE", "PRO", "BUSINESS"]),
  status: z.enum(["ACTIVE", "PAST_DUE", "CANCELED", "TRIALING"]),
  cancelAtPeriodEnd: z.boolean().optional(),
});
export type BillingEvent = z.infer<typeof billingEventSchema>;
export interface BillingProvider {
  readonly name: string;
  verifyWebhook(body: string, signature: string): BillingEvent;
}
export class MockBillingProvider implements BillingProvider {
  readonly name = "mock";
  constructor(private readonly secret: string) {}
  verifyWebhook(body: string, signature: string) {
    const expected = createHmac("sha256", this.secret)
      .update(body)
      .digest("hex");
    if (
      !/^[a-f0-9]{64}$/i.test(signature) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    )
      throw new Error("Invalid webhook signature.");
    return billingEventSchema.parse(JSON.parse(body));
  }
}
export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";
  readonly client: Stripe;
  constructor(
    apiKey: string,
    private readonly webhookSecret: string,
    private readonly prices: Record<string, Plan>,
  ) {
    this.client = new Stripe(apiKey);
  }
  verifyWebhook(body: string, signature: string): BillingEvent {
    const event = this.client.webhooks.constructEvent(
      body,
      signature,
      this.webhookSecret,
    );
    if (
      ![
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type)
    )
      throw new Error("Unsupported subscription event.");
    const subscription = event.data.object as Stripe.Subscription;
    const price = subscription.items.data[0]?.price.id;
    const plan = price ? this.prices[price] : undefined;
    if (!plan) throw new Error("Unmapped subscription price.");
    return billingEventSchema.parse({
      id: event.id,
      organizationId: subscription.metadata.organizationId,
      plan,
      status:
        subscription.status === "active"
          ? "ACTIVE"
          : subscription.status === "trialing"
            ? "TRIALING"
            : subscription.status === "canceled"
              ? "CANCELED"
              : "PAST_DUE",
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }
}
