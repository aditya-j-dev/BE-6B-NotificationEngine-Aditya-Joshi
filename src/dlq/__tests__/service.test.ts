import { describe, expect, it, vi } from "vitest";

import {
    DeadLetterQueueDashboardService,
    DlqEntryResolvedError,
    type DlqDashboardStore,
} from "..";

const createdAt = new Date("2026-09-15T12:00:00.000Z");
const entry = {
    id: "dlq-1",
    notificationId: "notification-1",
    notificationCreatedAt: createdAt,
    failureReason: "SMTP_DOWN",
    retryCount: 5,
    lastError: "SMTP unavailable",
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    resolutionAction: null,
    classification: "TRANSIENT" as const,
    createdAt,
};

function createStore(options: { resolved?: boolean } = {}) {
    const current = { ...entry, resolved: options.resolved ?? false };
    const transaction = {
        deadLetterQueue: {
            findMany: vi.fn(async () => [current]),
            count: vi.fn(async () => 1),
            findUnique: vi.fn(async () => current),
            update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data })),
        },
        notification: { update: vi.fn() },
        notificationStateLog: { create: vi.fn() },
    };
    return {
        ...transaction,
        $transaction: async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction),
    } as unknown as DlqDashboardStore & typeof transaction;
}

describe("DeadLetterQueueDashboardService", () => {
    it("lists unresolved entries and supports a failure-reason filter", async () => {
        const store = createStore();
        const service = new DeadLetterQueueDashboardService(store);

        await expect(service.list({ reason: "smtp", limit: 10 })).resolves.toMatchObject({
            total: 1,
            limit: 10,
            entries: [{ id: "dlq-1" }],
        });
        expect(store.deadLetterQueue.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { resolved: false, failureReason: { contains: "smtp", mode: "insensitive" } },
        }));
    });

    it("manually retries an unresolved entry and queues its notification", async () => {
        const store = createStore();
        const service = new DeadLetterQueueDashboardService(store, () => new Date("2026-09-15T13:00:00.000Z"));

        await expect(service.retry("dlq-1", "ops@example.com")).resolves.toMatchObject({
            resolved: true,
            resolutionAction: "RETRY",
        });
        expect(store.notification.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: "QUEUED", nextRetryAt: new Date("2026-09-15T13:00:00.000Z"), failedReason: null },
        }));
        expect(store.notificationStateLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ toStatus: "QUEUED", actor: "dlq-dashboard:ops@example.com" }),
        }));
    });

    it("discards an entry and leaves the notification terminally failed", async () => {
        const store = createStore();
        const service = new DeadLetterQueueDashboardService(store);

        await expect(service.discard("dlq-1", "ops@example.com")).resolves.toMatchObject({
            resolutionAction: "DISCARD",
        });
        expect(store.notification.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: "FAILED", nextRetryAt: null, failedReason: "SMTP unavailable" },
        }));
    });

    it("does not allow a resolved entry to be retried or discarded again", async () => {
        const service = new DeadLetterQueueDashboardService(createStore({ resolved: true }));

        await expect(service.retry("dlq-1", "ops@example.com")).rejects.toBeInstanceOf(DlqEntryResolvedError);
    });
});
