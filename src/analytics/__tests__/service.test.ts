import { describe, expect, it } from "vitest";

import { AnalyticsApiService, type ChannelMetricsSnapshotSource, type OptOutTrendStore } from "..";

describe("AnalyticsApiService", () => {
    it("groups opt-outs by UTC date and consent type", async () => {
        const optOutStore: OptOutTrendStore = {
            consentAuditLog: {
                findMany: async () => [
                    { consentType: "MARKETING", createdAt: new Date("2026-09-14T23:30:00.000Z") },
                    { consentType: "MARKETING", createdAt: new Date("2026-09-15T03:00:00.000Z") },
                    { consentType: "TRANSACTIONAL", createdAt: new Date("2026-09-15T04:00:00.000Z") },
                ],
            },
        };
        const service = new AnalyticsApiService(
            { deliveryMetrics: async () => [] } as never,
            { snapshot: async () => ({ channel: "EMAIL", deliveries: 0, failures: 0, latencyTotalMs: 0, latencySamples: 0, averageLatencyMs: 0 }) } as ChannelMetricsSnapshotSource,
            optOutStore,
        );

        await expect(service.optOutTrends()).resolves.toEqual([
            { date: "2026-09-14", consentType: "MARKETING", count: 1 },
            { date: "2026-09-15", consentType: "MARKETING", count: 1 },
            { date: "2026-09-15", consentType: "TRANSACTIONAL", count: 1 },
        ]);
    });

    it("returns a realtime snapshot for each requested channel", async () => {
        const source: ChannelMetricsSnapshotSource = {
            snapshot: async (channel) => ({ channel, deliveries: 8, failures: 2, latencyTotalMs: 500, latencySamples: 10, averageLatencyMs: 50 }),
        };
        const service = new AnalyticsApiService(
            { deliveryMetrics: async () => [] } as never,
            source,
            { consentAuditLog: { findMany: async () => [] } },
        );

        await expect(service.channelPerformance(["EMAIL", "SMS"])).resolves.toEqual([
            { channel: "EMAIL", deliveries: 8, failures: 2, latencyTotalMs: 500, latencySamples: 10, averageLatencyMs: 50 },
            { channel: "SMS", deliveries: 8, failures: 2, latencyTotalMs: 500, latencySamples: 10, averageLatencyMs: 50 },
        ]);
    });
});
