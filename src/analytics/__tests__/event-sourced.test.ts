import { describe, expect, it } from "vitest";

import { EventSourcedAnalyticsService, type EventSourcedAnalyticsStore } from "..";

const start = new Date("2026-09-15T12:00:00.000Z");
const logs = [
    {
        notificationId: "n-1", notificationCreatedAt: start, toStatus: "FAILED" as const,
        createdAt: new Date("2026-09-15T12:01:00.000Z"),
        notification: { channel: "SMS" as const, createdAt: start },
    },
    {
        notificationId: "n-1", notificationCreatedAt: start, toStatus: "DELIVERED" as const,
        createdAt: new Date("2026-09-15T12:05:00.000Z"),
        notification: { channel: "SMS" as const, createdAt: start },
    },
    {
        notificationId: "n-2", notificationCreatedAt: start, toStatus: "BOUNCED" as const,
        createdAt: new Date("2026-09-15T12:02:00.000Z"),
        notification: { channel: "SMS" as const, createdAt: start },
    },
    {
        notificationId: "n-3", notificationCreatedAt: start, toStatus: "DELIVERED" as const,
        createdAt: new Date("2026-09-15T12:03:00.000Z"),
        notification: { channel: "EMAIL" as const, createdAt: start },
    },
];

const store: EventSourcedAnalyticsStore = {
    notificationStateLog: {
        findMany: async ({ where }) => logs.filter((log) => !where.notification || log.notification.channel === where.notification.is.channel),
    },
};

describe("EventSourcedAnalyticsService", () => {
    it("uses the latest terminal transition for each notification", async () => {
        const service = new EventSourcedAnalyticsService(store);

        await expect(service.deliveryMetrics()).resolves.toEqual([
            {
                channel: "EMAIL",
                delivered: 1,
                failed: 0,
                terminalNotifications: 1,
                deliveryRate: 1,
                averageDeliveryLatencyMs: 180_000,
            },
            {
                channel: "SMS",
                delivered: 1,
                failed: 1,
                terminalNotifications: 2,
                deliveryRate: 0.5,
                averageDeliveryLatencyMs: 300_000,
            },
        ]);
    });

    it("can derive metrics for one channel", async () => {
        const service = new EventSourcedAnalyticsService(store);

        await expect(service.deliveryMetrics({ channel: "SMS" })).resolves.toMatchObject([
            { channel: "SMS", delivered: 1, failed: 1 },
        ]);
    });
});
