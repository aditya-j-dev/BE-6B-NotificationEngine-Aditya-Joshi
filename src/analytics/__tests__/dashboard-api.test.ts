import { createServer, type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAnalyticsDashboardApiHandler, type AnalyticsApiService } from "..";

describe("analytics dashboard API", () => {
    let server: Server;
    let baseUrl: string;
    const service = {
        deliveryRates: vi.fn(async () => [{ channel: "EMAIL", deliveryRate: 0.98 }]),
        channelPerformance: vi.fn(async () => [{ channel: "EMAIL", averageLatencyMs: 100 }]),
        optOutTrends: vi.fn(async () => [{ date: "2026-09-15", consentType: "MARKETING", count: 2 }]),
        costs: vi.fn(async () => [{ channel: "EMAIL", totalCostPaisa: 2 }]),
    } as unknown as AnalyticsApiService;

    beforeEach(async () => {
        server = createServer(createAnalyticsDashboardApiHandler(service));
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    it("returns each required analytics dataset", async () => {
        await expect(fetch(`${baseUrl}/analytics/delivery-rates?channel=EMAIL`)).resolves.toMatchObject({ status: 200 });
        expect(service.deliveryRates).toHaveBeenCalledWith({ channel: "EMAIL" });

        await expect(fetch(`${baseUrl}/analytics/channel-performance?channel=EMAIL`)).resolves.toMatchObject({ status: 200 });
        expect(service.channelPerformance).toHaveBeenCalledWith(["EMAIL"]);

        const trends = await fetch(`${baseUrl}/analytics/opt-out-trends`);
        expect(trends.status).toBe(200);
        await expect(trends.json()).resolves.toMatchObject({ trends: [{ consentType: "MARKETING", count: 2 }] });

        const costs = await fetch(`${baseUrl}/analytics/costs?channel=EMAIL&provider=ses`);
        expect(costs.status).toBe(200);
        expect(service.costs).toHaveBeenCalledWith({ channel: "EMAIL", provider: "ses" });

        const dashboard = await fetch(`${baseUrl}/analytics/mock-dashboard`);
        expect(dashboard.status).toBe(200);
        await expect(dashboard.json()).resolves.toMatchObject({ dashboard: { channels: expect.any(Array) } });
    });

    it("rejects invalid filters", async () => {
        await expect(fetch(`${baseUrl}/analytics/delivery-rates?channel=LETTER`)).resolves.toMatchObject({ status: 400 });
        await expect(fetch(`${baseUrl}/analytics/opt-out-trends?from=not-a-date`)).resolves.toMatchObject({ status: 400 });
    });
});
