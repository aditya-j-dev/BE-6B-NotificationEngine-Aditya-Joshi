import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderHealthCheckService } from "../../providers";
import {
    correlationId,
    createLogger,
    CriticalAlertService,
    GracefulShutdownManager,
    HealthService,
    observeRequest,
    resolveLogLevel,
    runWithCorrelationId,
} from "..";

const silentLogger = createLogger({ LOG_LEVEL: "silent" });

describe("observability", () => {
    it("uses supported environment log levels and defaults invalid values to info", () => {
        expect(resolveLogLevel("DEBUG")).toBe("debug");
        expect(resolveLogLevel("unexpected")).toBe("info");
    });

    it("preserves correlation IDs across async work", async () => {
        await expect(runWithCorrelationId("correlation-1", async () => {
            await Promise.resolve();
            return correlationId();
        })).resolves.toBe("correlation-1");
    });

    it("marks readiness unhealthy when a required dependency is missing or fails", async () => {
        const health = new HealthService(
            [
                { name: "postgres", check: async () => undefined },
                { name: "redis", check: async () => { throw new Error("Redis unavailable"); } },
                { name: "kafka", check: async () => undefined },
            ],
            [],
            new ProviderHealthCheckService(),
            () => new Date("2026-09-15T00:00:00.000Z"),
        );
        const report = await health.readiness();

        expect(report.status).toBe("UNHEALTHY");
        expect(report.components).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: "redis", state: "DOWN" }),
            expect.objectContaining({ name: "rabbitmq", state: "DOWN" }),
        ]));
    });

    it("bounds a stalled dependency health check", async () => {
        const health = new HealthService(
            [
                { name: "postgres", check: async () => new Promise<void>(() => undefined) },
                { name: "redis", check: async () => undefined },
                { name: "kafka", check: async () => undefined },
                { name: "rabbitmq", check: async () => undefined },
            ],
            [],
            new ProviderHealthCheckService(),
            () => new Date(),
            1,
        );
        await expect(health.readiness()).resolves.toMatchObject({
            status: "UNHEALTHY",
            components: expect.arrayContaining([expect.objectContaining({ name: "postgres", message: "Health check timed out" })]),
        });
    });

    it("stops intake, drains work, then closes resources in reverse order", async () => {
        const steps: string[] = [];
        const shutdown = new GracefulShutdownManager([
            { name: "api", stopIntake: async () => { steps.push("api:stop"); }, close: async () => { steps.push("api:close"); } },
            { name: "worker", drain: async () => { steps.push("worker:drain"); }, close: async () => { steps.push("worker:close"); } },
        ], silentLogger);

        await expect(shutdown.shutdown()).resolves.toMatchObject({ failures: [] });
        expect(steps).toEqual(["api:stop", "worker:drain", "worker:close", "api:close"]);
    });

    it("emits critical alerts for error rate, lag, provider, and dependency failures", async () => {
        const send = vi.fn(async () => undefined);
        const alerts = await new CriticalAlertService({ send }).evaluate({
            observedAt: new Date("2026-09-15T00:00:00.000Z"),
            errorRate: 0.1,
            kafkaConsumerLag: 20_000,
            unavailableProviders: ["twilio"],
            unhealthyDependencies: ["redis"],
        });

        expect(alerts).toHaveLength(4);
        expect(send).toHaveBeenCalledTimes(4);
    });
});

describe("request observability", () => {
    let server: Server | undefined;

    afterEach(async () => {
        if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
        server = undefined;
    });

    it("propagates the supplied correlation ID to the response", async () => {
        server = createServer((request, response) => observeRequest(request, response, silentLogger, (_request, handledResponse) => {
            handledResponse.writeHead(204);
            handledResponse.end();
        }));
        await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not bind");

        const response = await fetch(`http://127.0.0.1:${address.port}/health/live`, { headers: { "x-correlation-id": "request-123" } });
        expect(response.status).toBe(204);
        expect(response.headers.get("x-correlation-id")).toBe("request-123");
    });
});
