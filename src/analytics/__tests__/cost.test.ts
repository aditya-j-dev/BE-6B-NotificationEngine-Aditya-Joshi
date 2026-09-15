import { describe, expect, it } from "vitest";

import { CostAnalyticsService, type CostAnalyticsStore } from "..";

const store: CostAnalyticsStore = {
    notification: {
        findMany: async () => [
            { channel: "SMS", provider: "msg91", status: "DELIVERED", costPaisa: 70 },
            { channel: "SMS", provider: "msg91", status: "FAILED", costPaisa: 70 },
            { channel: "EMAIL", provider: null, status: "DELIVERED", costPaisa: 2 },
        ],
    },
};

describe("CostAnalyticsService", () => {
    it("calculates channel/provider totals and delivery-adjusted cost in paisa", async () => {
        const service = new CostAnalyticsService(store);

        await expect(service.metrics()).resolves.toEqual([
            {
                channel: "EMAIL", provider: "UNASSIGNED", billedNotifications: 1, deliveredNotifications: 1,
                totalCostPaisa: 2, totalCostInr: 0.02, averageCostPaisa: 2, costPerDeliveredPaisa: 2,
            },
            {
                channel: "SMS", provider: "msg91", billedNotifications: 2, deliveredNotifications: 1,
                totalCostPaisa: 140, totalCostInr: 1.4, averageCostPaisa: 70, costPerDeliveredPaisa: 140,
            },
        ]);
    });
});
