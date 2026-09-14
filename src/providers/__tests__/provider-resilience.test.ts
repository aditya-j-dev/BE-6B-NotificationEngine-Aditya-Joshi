import { describe, expect, it, vi } from "vitest";

import type { DeliveryProvider } from "../delivery-provider";
import {
    FixedWindowProviderRateLimiter,
    ProviderCircuitBreaker,
    ResilientDeliveryProvider,
} from "../provider-resilience";

const notification = {
    notificationId: "notification-1",
    eventId: "event-1",
    eventType: "TXNX-001",
    userId: "user-1",
    channel: "EMAIL" as const,
    recipient: "investor@example.com",
    content: "Order executed.",
};

function provider(send: DeliveryProvider["send"]): DeliveryProvider {
    return {
        send,
        getStatus: async () => "UNKNOWN",
        validateRecipient: async () => ({ valid: true }),
        getQuota: async () => ({
            provider: "test", channel: "EMAIL", limit: null, remaining: null, resetsAt: null,
        }),
    };
}

describe("provider resilience", () => {
    it("rate limits sends per provider without affecting other providers", async () => {
        let now = 0;
        const limiter = new FixedWindowProviderRateLimiter({ maxRequests: 1, windowMs: 1_000 }, () => now);
        const circuit = new ProviderCircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000 }, () => now);
        const send = vi.fn().mockResolvedValue({ status: "SENT", externalId: "email-1", acceptedAt: "now" });
        const email = new ResilientDeliveryProvider("email", provider(send), limiter, circuit);
        const sms = new ResilientDeliveryProvider("sms", provider(send), limiter, circuit);

        await expect(email.send(notification)).resolves.toMatchObject({ status: "SENT" });
        await expect(email.send(notification)).resolves.toMatchObject({
            failureCode: "PROVIDER_RATE_LIMITED", retryable: true,
        });
        await expect(sms.send(notification)).resolves.toMatchObject({ status: "SENT" });
        now += 1_000;
        await expect(email.send(notification)).resolves.toMatchObject({ status: "SENT" });
    });

    it("opens the circuit after consecutive provider failures and blocks the next send", async () => {
        const now = 0;
        const circuit = new ProviderCircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000 }, () => now);
        const send = vi.fn().mockResolvedValue({
            status: "FAILED", failureCode: "DOWN", failureReason: "down", retryable: true,
        });
        const resilient = new ResilientDeliveryProvider(
            "email", provider(send),
            new FixedWindowProviderRateLimiter({ maxRequests: 10, windowMs: 1_000 }, () => now),
            circuit,
        );

        await resilient.send(notification);
        await resilient.send(notification);
        await expect(resilient.send(notification)).resolves.toMatchObject({
            failureCode: "PROVIDER_CIRCUIT_OPEN",
            providerMetadata: { circuitState: "OPEN" },
        });
        expect(send).toHaveBeenCalledTimes(2);
    });

    it("allows one half-open probe after cooldown and closes the circuit on success", async () => {
        let now = 0;
        const circuit = new ProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000 }, () => now);
        const send = vi.fn()
            .mockResolvedValueOnce({ status: "FAILED", failureCode: "DOWN", failureReason: "down", retryable: true })
            .mockResolvedValueOnce({ status: "SENT", externalId: "email-1", acceptedAt: "now" });
        const resilient = new ResilientDeliveryProvider(
            "email", provider(send),
            new FixedWindowProviderRateLimiter({ maxRequests: 10, windowMs: 1_000 }, () => now),
            circuit,
        );

        await resilient.send(notification);
        now += 1_000;
        await expect(resilient.send(notification)).resolves.toMatchObject({ status: "SENT" });
        expect(circuit.state("email")).toBe("CLOSED");
    });

    it("converts a thrown provider exception into a retryable failure and opens its circuit", async () => {
        const now = 0;
        const circuit = new ProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000 }, () => now);
        const resilient = new ResilientDeliveryProvider(
            "email", provider(async () => { throw new Error("SMTP unavailable"); }),
            new FixedWindowProviderRateLimiter({ maxRequests: 10, windowMs: 1_000 }, () => now),
            circuit,
        );

        await expect(resilient.send(notification)).resolves.toMatchObject({
            failureCode: "PROVIDER_UNEXPECTED_ERROR", retryable: true,
        });
        expect(circuit.state("email")).toBe("OPEN");
    });

    it("delegates non-send provider operations unchanged", async () => {
        const underlying = provider(async () => ({ status: "SENT", externalId: "email-1", acceptedAt: "now" }));
        const resilient = new ResilientDeliveryProvider(
            "email", underlying,
            new FixedWindowProviderRateLimiter({ maxRequests: 1, windowMs: 1_000 }),
            new ProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000 }),
        );

        await expect(resilient.getStatus("email-1")).resolves.toBe("UNKNOWN");
        await expect(resilient.validateRecipient("investor@example.com")).resolves.toEqual({ valid: true });
        await expect(resilient.getQuota()).resolves.toMatchObject({ provider: "test" });
    });
});
