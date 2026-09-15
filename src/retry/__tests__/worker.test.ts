import { describe, expect, it, vi } from "vitest";

import {
    calculateRetryDelay,
    PriorityRetryWorker,
    PRIORITY_RETRY_POLICIES,
    RetryWorker,
    type RetryJob,
    type RetryScheduler,
} from "..";

interface TestPayload {
    notificationId: string;
}

const job: RetryJob<TestPayload> = {
    id: "retry-notification-1",
    payload: { notificationId: "notification-1" },
    attemptsMade: 0,
};

describe("calculateRetryDelay", () => {
    it("uses exponential backoff with bounded jitter from Part A A9.1", () => {
        const policy = { baseDelayMs: 1_000, maxDelayMs: 300_000, jitterMs: 1_000, maxRetries: 5 };

        expect(calculateRetryDelay(1, policy, () => 0)).toBe(1_000);
        expect(calculateRetryDelay(2, policy, () => 0.5)).toBe(2_500);
        expect(calculateRetryDelay(3, policy, () => 0.999)).toBe(4_999);
        expect(calculateRetryDelay(12, policy, () => 0.999)).toBe(300_000);
    });
});

describe("priority retry policies", () => {
    it("maps the A9 retry table to ZeTheta event priorities", () => {
        expect(PRIORITY_RETRY_POLICIES.CRITICAL).toMatchObject({
            maxRetries: 10, baseDelayMs: 500, maxDelayMs: 60_000,
        });
        expect(PRIORITY_RETRY_POLICIES.HIGH).toMatchObject({
            maxRetries: 5, baseDelayMs: 1_000, maxDelayMs: 300_000,
        });
        expect(PRIORITY_RETRY_POLICIES.NORMAL).toMatchObject({
            maxRetries: 3, baseDelayMs: 5_000, maxDelayMs: 1_800_000,
        });
        expect(PRIORITY_RETRY_POLICIES.LOW).toMatchObject({
            maxRetries: 2, baseDelayMs: 30_000, maxDelayMs: 7_200_000,
        });
        expect(PRIORITY_RETRY_POLICIES.VERY_LOW).toEqual(PRIORITY_RETRY_POLICIES.LOW);
    });
});

describe("RetryWorker", () => {
    const dueNow = new Date("2026-09-15T12:00:00.000Z");

    it("schedules a retryable failure using the calculated jittered due time", async () => {
        const scheduler: RetryScheduler<TestPayload> = { schedule: vi.fn() };
        const worker = new RetryWorker(scheduler, undefined, () => dueNow, () => 0.5);

        await expect(worker.process(job, async () => ({
            status: "FAILED", failureCode: "SMTP_DOWN", failureReason: "down", retryable: true,
        }))).resolves.toMatchObject({
            outcome: "SCHEDULED",
            nextAttempt: 1,
            dueAt: new Date("2026-09-15T12:00:01.500Z"),
        });
        expect(scheduler.schedule).toHaveBeenCalledWith(
            { ...job, attemptsMade: 1 },
            new Date("2026-09-15T12:00:01.500Z"),
        );
    });

    it("does not retry a permanent provider failure", async () => {
        const scheduler: RetryScheduler<TestPayload> = { schedule: vi.fn() };
        const worker = new RetryWorker(scheduler);

        await expect(worker.process(job, async () => ({
            status: "FAILED", failureCode: "INVALID_RECIPIENT", failureReason: "invalid", retryable: false,
        }))).resolves.toMatchObject({ outcome: "PERMANENT_FAILURE" });
        expect(scheduler.schedule).not.toHaveBeenCalled();
    });

    it("marks retryable failures exhausted once the configured budget is consumed", async () => {
        const scheduler: RetryScheduler<TestPayload> = { schedule: vi.fn() };
        const worker = new RetryWorker(scheduler, {
            baseDelayMs: 1_000, maxDelayMs: 300_000, jitterMs: 1_000, maxRetries: 2,
        });

        await expect(worker.process({ ...job, attemptsMade: 2 }, async () => ({
            status: "FAILED", failureCode: "DOWN", failureReason: "down", retryable: true,
        }))).resolves.toMatchObject({ outcome: "RETRIES_EXHAUSTED" });
        expect(scheduler.schedule).not.toHaveBeenCalled();
    });

    it("returns delivery immediately without scheduling another job", async () => {
        const scheduler: RetryScheduler<TestPayload> = { schedule: vi.fn() };
        const worker = new RetryWorker(scheduler);

        await expect(worker.process(job, async () => ({
            status: "SENT", externalId: "email-1", acceptedAt: "now",
        }))).resolves.toMatchObject({ outcome: "DELIVERED" });
        expect(scheduler.schedule).not.toHaveBeenCalled();
    });

    it("uses a CRITICAL policy rather than the generic policy", async () => {
        const scheduler: RetryScheduler<TestPayload> = { schedule: vi.fn() };
        const worker = new PriorityRetryWorker(scheduler, undefined, () => dueNow, () => 0);

        await expect(worker.process({ ...job, priority: "CRITICAL" }, async () => ({
            status: "FAILED", failureCode: "DOWN", failureReason: "down", retryable: true,
        }))).resolves.toMatchObject({
            outcome: "SCHEDULED",
            dueAt: new Date("2026-09-15T12:00:00.500Z"),
        });
    });
});
