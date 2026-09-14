import { describe, expect, it } from "vitest";

import {
    ProviderHealthCheckService,
    type HealthCheckableProvider,
} from "../provider-health";

describe("ProviderHealthCheckService", () => {
    it("returns each provider's health result", async () => {
        const provider: HealthCheckableProvider = {
            provider: "twilio",
            channel: "SMS",
            checkHealth: async () => ({
                provider: "twilio",
                channel: "SMS",
                status: "HEALTHY",
                checkedAt: "2026-09-14T00:00:00.000Z",
                responseTimeMs: 10,
            }),
        };

        await expect(new ProviderHealthCheckService().checkAll([provider]))
            .resolves.toEqual([expect.objectContaining({ status: "HEALTHY" })]);
    });

    it("isolates a provider health-check failure", async () => {
        const provider: HealthCheckableProvider = {
            provider: "smtp",
            channel: "EMAIL",
            checkHealth: async () => {
                throw new Error("SMTP offline");
            },
        };

        await expect(new ProviderHealthCheckService().checkAll([provider]))
            .resolves.toEqual([expect.objectContaining({
                provider: "smtp",
                status: "UNAVAILABLE",
                message: "SMTP offline",
            })]);
    });
});
