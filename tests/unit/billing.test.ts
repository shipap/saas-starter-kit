import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  MockBillingProvider,
  StripeBillingProvider,
} from "../../packages/billing/src/index";

const secret = "fictional-webhook-test-secret";
const event = {
  id: "evt_unit",
  organizationId: "11111111-1111-4111-8111-111111111111",
  plan: "PRO",
  status: "ACTIVE",
};
describe("mock signed provider contract", () => {
  it("accepts authentic structured events", () => {
    const body = JSON.stringify(event);
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(
      new MockBillingProvider(secret).verifyWebhook(body, signature),
    ).toEqual(event);
  });
  it("rejects tampered payloads", () => {
    const signature = createHmac("sha256", secret)
      .update(JSON.stringify(event))
      .digest("hex");
    expect(() =>
      new MockBillingProvider(secret).verifyWebhook(
        JSON.stringify({ ...event, plan: "BUSINESS" }),
        signature,
      ),
    ).toThrow();
  });
  it("rejects malformed and wrong-length signatures", () => {
    for (const signature of [
      "",
      "invalid",
      "0".repeat(63),
      "0".repeat(64),
      "0".repeat(65),
    ])
      expect(() =>
        new MockBillingProvider(secret).verifyWebhook(
          JSON.stringify(event),
          signature,
        ),
      ).toThrow();
  });
  it("rejects authentic but invalid billing data", () => {
    const body = JSON.stringify({
      ...event,
      organizationId: "foreign-string",
      plan: "UNKNOWN",
    });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(() =>
      new MockBillingProvider(secret).verifyWebhook(body, signature),
    ).toThrow();
  });
});
describe("Stripe official SDK webhook adapter without network calls", () => {
  function fixture(
    type = "customer.subscription.updated",
    price = "price_fixture",
  ) {
    return JSON.stringify({
      id: "evt_stripe_fixture",
      object: "event",
      type,
      data: {
        object: {
          id: "sub_fixture",
          object: "subscription",
          status: "active",
          metadata: { organizationId: event.organizationId },
          cancel_at_period_end: false,
          items: { data: [{ price: { id: price } }] },
        },
      },
    });
  }
  it("verifies the SDK signature and maps a configured subscription price", () => {
    const body = fixture();
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret,
    });
    const adapter = new StripeBillingProvider(
      "sk_test_fictional_not_a_real_key",
      secret,
      { price_fixture: "PRO" },
    );
    expect(adapter.verifyWebhook(body, signature)).toEqual({
      id: "evt_stripe_fixture",
      organizationId: event.organizationId,
      plan: "PRO",
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
    });
  });
  it("rejects unsupported events and unmapped prices", () => {
    const adapter = new StripeBillingProvider(
      "sk_test_fictional_not_a_real_key",
      secret,
      { price_fixture: "PRO" },
    );
    for (const body of [
      fixture("invoice.paid"),
      fixture("customer.subscription.updated", "price_other"),
    ]) {
      const signature = Stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret,
      });
      expect(() => adapter.verifyWebhook(body, signature)).toThrow();
    }
  });
});
