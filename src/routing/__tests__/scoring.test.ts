import { describe, expect, it } from "vitest";

import { NotificationChannel } from "../../generated/prisma/enums";
import { PriorityWeightedChannelScorer } from "../scoring";

const scorer = new PriorityWeightedChannelScorer();

describe("PriorityWeightedChannelScorer", () => {
    it("gives regulatory requirements precedence over all lower-priority factors", () => {
        const regulatory = scorer.score({
            channel: NotificationChannel.SMS,
            source: "REGULATORY_OVERRIDE",
            mandatory: true,
        }, "CRITICAL", { deliveryRate: 0, averageLatencyMs: 20_000 });
        const preferred = scorer.score({
            channel: NotificationChannel.PUSH,
            source: "USER_PREFERENCE",
            mandatory: false,
        }, "CRITICAL", { deliveryRate: 1, averageLatencyMs: 1 });

        expect(regulatory.total).toBeGreaterThan(preferred.total);
        expect(regulatory.breakdown.regulatory).toBe(10_000);
    });

    it("gives an explicit user preference precedence over delivery optimization", () => {
        const preferred = scorer.score({
            channel: NotificationChannel.PUSH,
            source: "USER_PREFERENCE",
            mandatory: false,
        }, "NORMAL", { deliveryRate: 0, averageLatencyMs: 20_000 });
        const defaultChannel = scorer.score({
            channel: NotificationChannel.EMAIL,
            source: "SYSTEM_DEFAULT",
            mandatory: false,
        }, "NORMAL", { deliveryRate: 1, averageLatencyMs: 1 });

        expect(preferred.total).toBeGreaterThan(defaultChannel.total);
    });

    it("uses delivery rate and latency to rank channels with the same preference source", () => {
        const reliable = scorer.score({
            channel: NotificationChannel.PUSH,
            source: "SYSTEM_DEFAULT",
            mandatory: false,
        }, "NORMAL", { deliveryRate: 0.95, averageLatencyMs: 100 });
        const unreliable = scorer.score({
            channel: NotificationChannel.EMAIL,
            source: "SYSTEM_DEFAULT",
            mandatory: false,
        }, "NORMAL", { deliveryRate: 0.4, averageLatencyMs: 2_000 });

        expect(reliable.breakdown.deliveryOptimization)
            .toBeGreaterThan(unreliable.breakdown.deliveryOptimization);
        expect(reliable.total).toBeGreaterThan(unreliable.total);
    });

    it("uses cost to favor low-cost non-urgent channels with comparable delivery", () => {
        const email = scorer.score({
            channel: NotificationChannel.EMAIL,
            source: "SYSTEM_DEFAULT",
            mandatory: false,
        }, "LOW", { deliveryRate: 0.9, averageLatencyMs: 100 });
        const sms = scorer.score({
            channel: NotificationChannel.SMS,
            source: "SYSTEM_DEFAULT",
            mandatory: false,
        }, "LOW", { deliveryRate: 0.9, averageLatencyMs: 100 });

        expect(email.breakdown.costOptimization).toBeGreaterThan(sms.breakdown.costOptimization);
        expect(email.total).toBeGreaterThan(sms.total);
    });

    it("does not penalize SMS cost for critical events", () => {
        const result = scorer.score({
            channel: NotificationChannel.SMS,
            source: "SYSTEM_DEFAULT",
            mandatory: false,
        }, "CRITICAL", { deliveryRate: 0.9, averageLatencyMs: 100 });

        expect(result.breakdown.costOptimization).toBe(0);
    });
});
