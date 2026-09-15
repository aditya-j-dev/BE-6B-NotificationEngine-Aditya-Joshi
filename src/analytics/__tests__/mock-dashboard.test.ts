import { describe, expect, it } from "vitest";

import { createMockDashboardDataset } from "..";

describe("mock dashboard dataset", () => {
    it("is deterministic, privacy-safe, and internally reconciled", () => {
        const dataset = createMockDashboardDataset();

        expect(dataset).toEqual(createMockDashboardDataset());
        expect(dataset.channels).toHaveLength(5);
        expect(dataset.deliveryTimeline).toHaveLength(7);
        expect(dataset.channels.reduce((total, channel) => total + channel.delivered, 0)).toBe(dataset.summary.deliveredNotifications);
        expect(dataset.channels.reduce((total, channel) => total + channel.failed, 0)).toBe(dataset.summary.failedNotifications);
        expect(dataset.summary.totalNotifications).toBe(dataset.summary.deliveredNotifications + dataset.summary.failedNotifications);
        expect(JSON.stringify(dataset)).not.toMatch(/@|\+91|customer|userId/i);
    });
});
