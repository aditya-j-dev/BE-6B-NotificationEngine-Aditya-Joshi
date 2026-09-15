import { describe, expect, it } from "vitest";

import {
    DeadLetterQueueConsumer,
    DeadLetterQueueDashboardService,
    type DeadLetterQueueStore,
    type DlqDashboardStore,
} from "..";
import { RetryWorker, type RetryScheduler } from "../../retry";

const createdAt = new Date("2026-09-15T12:00:00.000Z");

function createPipelineStore() {
    const notification = {
        id: "notification-1",
        createdAt,
        status: "RETRYING",
        deliveryAttempts: 1,
        failedReason: null as string | null,
        nextRetryAt: null as Date | null,
    };
    let entry: {
        id: string;
        notificationId: string;
        notificationCreatedAt: Date;
        failureReason: string;
        retryCount: number;
        lastError: string | null;
        resolved: boolean;
        resolvedBy: string | null;
        resolvedAt: Date | null;
        resolutionAction: string | null;
        classification: "TRANSIENT" | "PERMANENT" | "CONFIGURATION_ERROR" | null;
        createdAt: Date;
    } | null = null;
    const stateLogs: Array<{ fromStatus: string; toStatus: string; actor: string }> = [];

    const transaction = {
        notification: {
            findUnique: async () => ({ id: notification.id, createdAt: notification.createdAt, status: notification.status }),
            update: async ({ data }: { data: Record<string, unknown> }) => {
                Object.assign(notification, data);
                return notification;
            },
        },
        deadLetterQueue: {
            findFirst: async () => entry?.resolved ? null : entry,
            create: async ({ data }: { data: Record<string, unknown> }) => {
                entry = {
                    id: "dlq-1",
                    notificationId: String(data.notificationId),
                    notificationCreatedAt: data.notificationCreatedAt as Date,
                    failureReason: String(data.failureReason),
                    retryCount: Number(data.retryCount),
                    lastError: String(data.lastError),
                    resolved: false,
                    resolvedBy: null,
                    resolvedAt: null,
                    resolutionAction: null,
                    classification: data.classification as "TRANSIENT" | "PERMANENT" | "CONFIGURATION_ERROR",
                    createdAt: new Date(createdAt),
                };
                return entry;
            },
            findMany: async ({ where }: { where: { resolved?: boolean; failureReason?: { contains: string } } }) => {
                if (!entry || (where.resolved !== undefined && entry.resolved !== where.resolved)) return [];
                if (where.failureReason && !entry.failureReason.toLowerCase().includes(where.failureReason.contains.toLowerCase())) return [];
                return [entry];
            },
            count: async ({ where }: { where: { resolved?: boolean; failureReason?: { contains: string } } }) => {
                if (!entry || (where.resolved !== undefined && entry.resolved !== where.resolved)) return 0;
                return 1;
            },
            findUnique: async () => entry,
            update: async ({ data }: { data: Record<string, unknown> }) => {
                if (!entry) throw new Error("Missing DLQ entry");
                Object.assign(entry, data);
                return entry;
            },
        },
        notificationStateLog: {
            create: async ({ data }: { data: { fromStatus: string; toStatus: string; actor: string } }) => {
                stateLogs.push(data);
                return data;
            },
        },
    };

    return {
        store: {
            ...transaction,
            $transaction: async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction),
        } as unknown as DeadLetterQueueStore & DlqDashboardStore,
        notification,
        stateLogs,
    };
}

describe("DLQ processing pipeline", () => {
    it("moves an exhausted retry through classified DLQ triage and a manual requeue", async () => {
        const scheduler: RetryScheduler<{ notificationId: string }> = { schedule: async () => undefined };
        const retryWorker = new RetryWorker(scheduler, {
            baseDelayMs: 1_000,
            maxDelayMs: 300_000,
            jitterMs: 0,
            maxRetries: 1,
        });
        const retryResult = await retryWorker.process(
            { id: "notification-1", payload: { notificationId: "notification-1" }, attemptsMade: 1 },
            async () => ({
                status: "FAILED" as const,
                failureCode: "HTTP_503",
                failureReason: "Provider unavailable",
                retryable: true,
            }),
        );
        expect(retryResult.outcome).toBe("RETRIES_EXHAUSTED");
        if (retryResult.outcome !== "RETRIES_EXHAUSTED") throw new Error("Expected exhausted retry");

        const pipeline = createPipelineStore();
        const consumer = new DeadLetterQueueConsumer(pipeline.store);
        await expect(consumer.consume({
            notificationId: "notification-1",
            notificationCreatedAt: createdAt,
            originalEvent: { eventId: "event-1", eventType: "TXNX-001" },
            retryCount: 1,
            maxRetries: 1,
            failure: retryResult.result,
        })).resolves.toMatchObject({
            outcome: "ENQUEUED",
            entry: { classification: "TRANSIENT" },
        });
        expect(pipeline.notification.status).toBe("DLQ");

        const dashboard = new DeadLetterQueueDashboardService(pipeline.store, () => new Date("2026-09-15T12:05:00.000Z"));
        await expect(dashboard.list({ reason: "503" })).resolves.toMatchObject({ total: 1 });
        await dashboard.retry("dlq-1", "ops@example.com");

        expect(pipeline.notification.status).toBe("QUEUED");
        expect(pipeline.stateLogs).toEqual([
            expect.objectContaining({ fromStatus: "RETRYING", toStatus: "DLQ", actor: "retry-dlq-consumer" }),
            expect.objectContaining({ fromStatus: "DLQ", toStatus: "QUEUED", actor: "dlq-dashboard:ops@example.com" }),
        ]);
        await expect(dashboard.list()).resolves.toMatchObject({ total: 0 });
    });
});
