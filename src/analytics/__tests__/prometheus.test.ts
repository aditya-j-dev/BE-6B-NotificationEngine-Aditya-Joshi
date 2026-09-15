import { createServer, type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPrometheusMetricsHandler, PrometheusMetricsService } from "..";

describe("PrometheusMetricsService", () => {
    it("renders counters and latency summaries for every configured channel", async () => {
        const service = new PrometheusMetricsService({
            snapshot: async (channel) => ({
                channel,
                deliveries: channel === "SMS" ? 4 : 0,
                failures: channel === "SMS" ? 1 : 0,
                latencyTotalMs: channel === "SMS" ? 500 : 0,
                latencySamples: channel === "SMS" ? 5 : 0,
                averageLatencyMs: channel === "SMS" ? 100 : 0,
            }),
        });

        await expect(service.render()).resolves.toContain('zetheta_delivery_attempts_total{channel="SMS",outcome="success"} 4');
        await expect(service.render()).resolves.toContain('zetheta_delivery_latency_milliseconds_sum{channel="SMS"} 500');
        await expect(service.render()).resolves.toContain('zetheta_delivery_attempts_total{channel="WHATSAPP",outcome="failure"} 0');
    });
});

describe("/metrics", () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
        const service = new PrometheusMetricsService({
            snapshot: async (channel) => ({
                channel, deliveries: 1, failures: 0, latencyTotalMs: 10, latencySamples: 1, averageLatencyMs: 10,
            }),
        }, ["EMAIL"]);
        server = createServer(createPrometheusMetricsHandler(service));
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    it("returns Prometheus content on GET and rejects other methods", async () => {
        const response = await fetch(`${baseUrl}/metrics`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/plain; version=0.0.4");
        expect(await response.text()).toContain('channel="EMAIL"');

        await expect(fetch(`${baseUrl}/metrics`, { method: "POST" })).resolves.toMatchObject({ status: 405 });
    });
});
