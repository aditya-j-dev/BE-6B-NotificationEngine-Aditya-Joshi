import { describe, expect, it, vi } from "vitest";

import {
    DeadLetterQueueConsumer,
    DlqNotificationNotFoundError,
    RetryNotExhaustedError,
    type DeadLetterQueueStore,
} from "..";

const createdAt = new Date("2026-09-15T12:00:00.000Z");
const input = {
    notificationId: "notification-1",
    notificationCreatedAt: createdAt,
    originalEvent: { eventId: "event-1", eventType: "TXNX-001" },
    retryCount: 5,
    maxRetries: 5,
    failure: {
        status: "FAILED" as const,
        failureCode: "SMTP_DOWN",
        failureReason: "SMTP unavailable",
        retryable: true,
    },
};

function createStore(options: { notificationFound?: boolean; existing?: boolean } = {}) {
    const notification = options.notificationFound === false
        ? null
        : { id: "notification-1", createdAt, status: "RETRYING" as const };
    const existing = options.existing
        ? {
            id: "dlq-existing", notificationId: "notification-1", notificationCreatedAt: createdAt,
            failureReason: "SMTP_DOWN", retryCount: 5, resolved: false, classification: "TRANSIENT" as const,
        }
        : null;
    const transaction = {
        notification: {
            findUnique: vi.fn(async () => notification),
            update: vi.fn(),
        },
        deadLetterQueue: {
            findFirst: vi.fn(async () => existing),
            create: vi.fn(async () => ({
                id: "dlq-1", notificationId: "notification-1", notificationCreatedAt: createdAt,
                failureReason: "SMTP_DOWN", retryCount: 5, resolved: false, classification: "TRANSIENT" as const,
            })),
        },
        notificationStateLog: { create: vi.fn() },
    };
    return {
        ...transaction,
        $transaction: async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction),
    } as unknown as DeadLetterQueueStore & typeof transaction;
}

describe("DeadLetterQueueConsumer", () => {
    it("persists one DLQ entry and changes an exhausted notification to DLQ", async () => {
        const store = createStore();
        const consumer = new DeadLetterQueueConsumer(store);

        await expect(consumer.consume(input)).resolves.toMatchObject({
            outcome: "ENQUEUED",
            entry: { id: "dlq-1", failureReason: "SMTP_DOWN", retryCount: 5, classification: "TRANSIENT" },
        });
        expect(store.notification.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: "DLQ", nextRetryAt: null }),
        }));
        expect(store.notificationStateLog.create).toHaveBeenCalledOnce();
    });

    it("is idempotent when the notification already has an unresolved DLQ entry", async () => {
        const store = createStore({ existing: true });
        const consumer = new DeadLetterQueueConsumer(store);

        await expect(consumer.consume(input)).resolves.toMatchObject({ outcome: "ALREADY_ENQUEUED" });
        expect(store.deadLetterQueue.create).not.toHaveBeenCalled();
        expect(store.notification.update).not.toHaveBeenCalled();
    });

    it("rejects a retry that has not consumed its configured budget", async () => {
        const consumer = new DeadLetterQueueConsumer(createStore());

        await expect(consumer.consume({ ...input, retryCount: 4 })).rejects.toBeInstanceOf(RetryNotExhaustedError);
    });

    it("does not create an orphaned DLQ entry when its notification cannot be found", async () => {
        const consumer = new DeadLetterQueueConsumer(createStore({ notificationFound: false }));

        await expect(consumer.consume(input)).rejects.toBeInstanceOf(DlqNotificationNotFoundError);
    });
});
