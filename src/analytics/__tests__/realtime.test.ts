import { describe, expect, it } from "vitest";

import {
    MetricsDeliveryProvider,
    RealtimeDeliveryMetricsService,
    type RedisRealtimeMetricsClient,
} from "..";
import type { DeliveryProvider } from "../../providers";

class MemoryRealtimeRedis implements RedisRealtimeMetricsClient {
    private readonly hashes = new Map<string, Map<string, number>>();

    async hincrby(key: string, field: string, increment: number): Promise<number> {
        const hash = this.hashes.get(key) ?? new Map<string, number>();
        const next = (hash.get(field) ?? 0) + increment;
        hash.set(field, next);
        this.hashes.set(key, hash);
        return next;
    }

    async hgetall(key: string): Promise<Record<string, string>> {
        return Object.fromEntries([...this.hashes.get(key)?.entries() ?? []].map(([field, value]) => [field, String(value)]));
    }
}

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
        getQuota: async () => ({ provider: "test", channel: "EMAIL", limit: null, remaining: null, resetsAt: null }),
    };
}

describe("RealtimeDeliveryMetricsService", () => {
    it("tracks successful and failed delivery attempts plus average latency by channel", async () => {
        const metrics = new RealtimeDeliveryMetricsService(new MemoryRealtimeRedis());
        await metrics.record("EMAIL", { status: "SENT", externalId: "email-1", acceptedAt: "now" }, 120);
        await metrics.record("EMAIL", {
            status: "FAILED", failureCode: "SMTP_DOWN", failureReason: "down", retryable: true,
        }, 80);

        await expect(metrics.snapshot("EMAIL")).resolves.toEqual({
            channel: "EMAIL",
            deliveries: 1,
            failures: 1,
            latencyTotalMs: 200,
            latencySamples: 2,
            averageLatencyMs: 100,
        });
        await expect(metrics.snapshot("SMS")).resolves.toMatchObject({ deliveries: 0, failures: 0 });
    });

    it("instruments provider sends without changing their result", async () => {
        let now = 0;
        const metrics = new RealtimeDeliveryMetricsService(new MemoryRealtimeRedis());
        const instrumented = new MetricsDeliveryProvider(provider(async () => {
            now += 75;
            return { status: "SENT", externalId: "email-1", acceptedAt: "now" };
        }), metrics, () => now);

        await expect(instrumented.send(notification)).resolves.toMatchObject({ status: "SENT" });
        await expect(metrics.snapshot("EMAIL")).resolves.toMatchObject({
            deliveries: 1,
            latencyTotalMs: 75,
            averageLatencyMs: 75,
        });
    });
});
