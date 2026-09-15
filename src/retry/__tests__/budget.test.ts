import { describe, expect, it, vi } from "vitest";

import {
    ProviderRetryBudgetGate,
    RetryBudgetMonitor,
    RetryWorker,
    type RedisRetryBudgetClient,
    type RetryScheduler,
} from "..";

class MemoryRetryBudgetRedis implements RedisRetryBudgetClient {
    readonly counts = new Map<string, number>();

    async eval(
        _script: string,
        numberOfKeys: number,
        ...arguments_: Array<string | number>
    ): Promise<unknown> {
        const keys = arguments_.slice(0, numberOfKeys).map(String);
        const values = arguments_.slice(numberOfKeys);

        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            const limit = Number(values[index * 2]);
            const current = this.counts.get(key) ?? 0;
            if (current >= limit) return [0, index + 1, current, limit, 60];
        }
        keys.forEach((key) => this.counts.set(key, (this.counts.get(key) ?? 0) + 1));
        return [1];
    }
}

const now = new Date("2026-09-15T12:34:30.000Z");

describe("RetryBudgetMonitor", () => {
    it("atomically enforces global and provider retry budgets without partial increments", async () => {
        const redis = new MemoryRetryBudgetRedis();
        const monitor = new RetryBudgetMonitor(redis, {
            maxGlobalRetriesPerMinute: 2,
            maxProviderRetriesPerMinute: 1,
            maxProviderRetriesPerHour: 10,
        });

        await expect(monitor.consume("twilio", now)).resolves.toEqual({ allowed: true });
        await expect(monitor.consume("twilio", now)).resolves.toMatchObject({
            allowed: false,
            blockedDimension: "PROVIDER_MINUTE",
            current: 1,
            limit: 1,
            retryAfterMs: 60_000,
        });
        await expect(monitor.consume("fcm", now)).resolves.toEqual({ allowed: true });
        expect([...redis.counts.values()]).toEqual([2, 1, 1, 1, 1]);
    });

    it("prevents the retry worker from scheduling a job when its provider budget is exhausted", async () => {
        const scheduler: RetryScheduler<{ provider: string }> = { schedule: vi.fn() };
        const monitor = new RetryBudgetMonitor(new MemoryRetryBudgetRedis(), {
            maxGlobalRetriesPerMinute: 10,
            maxProviderRetriesPerMinute: 1,
            maxProviderRetriesPerHour: 10,
        });
        const gate = new ProviderRetryBudgetGate<{ provider: string }>(monitor, (job) => job.payload.provider);
        const worker = new RetryWorker(scheduler, undefined, () => now, () => 0, gate);
        const job = { id: "retry-1", payload: { provider: "twilio" }, attemptsMade: 0 };
        const failedDelivery = async () => ({
            status: "FAILED" as const,
            failureCode: "DOWN",
            failureReason: "down",
            retryable: true,
        });

        await expect(worker.process(job, failedDelivery)).resolves.toMatchObject({ outcome: "SCHEDULED" });
        await expect(worker.process(job, failedDelivery)).resolves.toMatchObject({
            outcome: "RETRY_BUDGET_EXHAUSTED",
            retryAfterMs: 60_000,
        });
        expect(scheduler.schedule).toHaveBeenCalledOnce();
    });
});
