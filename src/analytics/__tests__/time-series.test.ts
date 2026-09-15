import { describe, expect, it } from "vitest";

import { TimeSeriesAnalyticsService, type TimeSeriesAnalyticsStore } from "..";

const logs = [
    { notificationId: "n-1", notificationCreatedAt: new Date("2026-09-15T10:00:00.000Z"), toStatus: "FAILED" as const, createdAt: new Date("2026-09-15T10:05:00.000Z"), notification: { channel: "SMS" as const } },
    { notificationId: "n-1", notificationCreatedAt: new Date("2026-09-15T10:00:00.000Z"), toStatus: "DELIVERED" as const, createdAt: new Date("2026-09-15T11:05:00.000Z"), notification: { channel: "SMS" as const } },
    { notificationId: "n-2", notificationCreatedAt: new Date("2026-09-15T10:00:00.000Z"), toStatus: "BOUNCED" as const, createdAt: new Date("2026-09-15T11:20:00.000Z"), notification: { channel: "SMS" as const } },
    { notificationId: "n-3", notificationCreatedAt: new Date("2026-09-15T10:00:00.000Z"), toStatus: "DELIVERED" as const, createdAt: new Date("2026-09-15T11:30:00.000Z"), notification: { channel: "EMAIL" as const } },
];

const store: TimeSeriesAnalyticsStore = {
    notificationStateLog: { findMany: async ({ where }) => logs.filter((log) => !where.notification || log.notification.channel === where.notification.is.channel) },
};

describe("TimeSeriesAnalyticsService", () => {
    it("uses each notification's final terminal state and buckets it by hour", async () => {
        const service = new TimeSeriesAnalyticsService(store);

        await expect(service.aggregate({
            from: new Date("2026-09-15T10:00:00.000Z"),
            to: new Date("2026-09-15T12:00:00.000Z"),
            bucket: "HOUR",
        })).resolves.toEqual([
            { bucketStart: "2026-09-15T11:00:00.000Z", bucket: "HOUR", channel: "EMAIL", delivered: 1, failed: 0, terminalNotifications: 1, deliveryRate: 1 },
            { bucketStart: "2026-09-15T11:00:00.000Z", bucket: "HOUR", channel: "SMS", delivered: 1, failed: 1, terminalNotifications: 2, deliveryRate: 0.5 },
        ]);
    });

    it("uses a bounded channel-specific query and rejects an inverted time range", async () => {
        const service = new TimeSeriesAnalyticsService(store);
        await expect(service.aggregate({
            from: new Date("2026-09-15T10:00:00.000Z"), to: new Date("2026-09-15T12:00:00.000Z"), bucket: "DAY", channel: "SMS",
        })).resolves.toHaveLength(1);
        await expect(service.aggregate({
            from: new Date("2026-09-16T00:00:00.000Z"), to: new Date("2026-09-15T00:00:00.000Z"), bucket: "DAY",
        })).rejects.toThrow("Time-series start must not be after its end");
    });
});
