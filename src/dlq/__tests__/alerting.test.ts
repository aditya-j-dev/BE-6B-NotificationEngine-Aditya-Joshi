import { describe, expect, it, vi } from "vitest";

import {
    DlqDepthAlertService,
    type DlqAlertSuppressionStore,
    type DlqDepthStore,
    type OperationsAlerter,
} from "..";

class MemorySuppressionStore implements DlqAlertSuppressionStore {
    private readonly keys = new Set<string>();

    async claim(key: string): Promise<boolean> {
        if (this.keys.has(key)) return false;
        this.keys.add(key);
        return true;
    }

    async release(key: string): Promise<void> {
        this.keys.delete(key);
    }
}

function depthStore(depth: () => number): DlqDepthStore {
    return { deadLetterQueue: { count: async () => depth() } };
}

describe("DlqDepthAlertService", () => {
    const policy = { depthThreshold: 10, criticalMultiplier: 2, cooldownSeconds: 300 };
    const now = () => new Date("2026-09-15T12:00:00.000Z");

    it("does not alert when unresolved DLQ depth is below the threshold", async () => {
        const alerter: OperationsAlerter = { send: vi.fn() };
        const service = new DlqDepthAlertService(depthStore(() => 9), alerter, new MemorySuppressionStore(), policy, now);

        await expect(service.evaluate()).resolves.toEqual({ outcome: "HEALTHY", depth: 9 });
        expect(alerter.send).not.toHaveBeenCalled();
    });

    it("alerts once, suppresses repeats, then alerts again after the depth recovers and breaches", async () => {
        let depth = 10;
        const alerter: OperationsAlerter = { send: vi.fn() };
        const service = new DlqDepthAlertService(depthStore(() => depth), alerter, new MemorySuppressionStore(), policy, now);

        await expect(service.evaluate()).resolves.toMatchObject({ outcome: "ALERT_SENT", alert: { severity: "WARNING" } });
        await expect(service.evaluate()).resolves.toMatchObject({ outcome: "ALERT_SUPPRESSED" });
        depth = 5;
        await service.evaluate();
        depth = 20;
        await expect(service.evaluate()).resolves.toMatchObject({ outcome: "ALERT_SENT", alert: { severity: "CRITICAL" } });
        expect(alerter.send).toHaveBeenCalledTimes(2);
    });

    it("releases suppression when operations alert delivery fails so it can be retried", async () => {
        const alerter: OperationsAlerter = { send: vi.fn().mockRejectedValue(new Error("ops channel unavailable")) };
        const service = new DlqDepthAlertService(depthStore(() => 10), alerter, new MemorySuppressionStore(), policy, now);

        await expect(service.evaluate()).rejects.toThrow("ops channel unavailable");
        await expect(service.evaluate()).rejects.toThrow("ops channel unavailable");
        expect(alerter.send).toHaveBeenCalledTimes(2);
    });
});
