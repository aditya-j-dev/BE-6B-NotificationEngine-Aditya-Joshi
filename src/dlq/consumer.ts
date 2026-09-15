import type { NotificationStatus } from "../generated/prisma/enums";
import type { DeliveryResult } from "../providers";

import { DlqFailureClassifier, type DlqFailureClassification } from "./classifier";

type FailedDelivery = Extract<DeliveryResult, { status: "FAILED" }>;

export interface ExhaustedRetryNotification {
    notificationId: string;
    notificationCreatedAt: Date;
    originalEvent: Record<string, unknown>;
    retryCount: number;
    maxRetries: number;
    failure: FailedDelivery;
}

export interface DeadLetterEntry {
    id: string;
    notificationId: string;
    notificationCreatedAt: Date;
    failureReason: string;
    retryCount: number;
    resolved: boolean;
    classification: DlqFailureClassification | null;
}

interface DlqNotificationSnapshot {
    id: string;
    createdAt: Date;
    status: NotificationStatus;
}

interface DlqTransaction {
    notification: {
        findUnique(args: {
            where: { id_createdAt: { id: string; createdAt: Date } };
            select: { id: true; createdAt: true; status: true };
        }): Promise<DlqNotificationSnapshot | null>;
        update(args: {
            where: { id_createdAt: { id: string; createdAt: Date } };
            data: { status: "DLQ"; deliveryAttempts: number; failedReason: string; nextRetryAt: null };
        }): Promise<unknown>;
    };
    deadLetterQueue: {
        findFirst(args: {
            where: { notificationId: string; notificationCreatedAt: Date; resolved: false };
            select: { id: true; notificationId: true; notificationCreatedAt: true; failureReason: true; retryCount: true; resolved: true };
        }): Promise<DeadLetterEntry | null>;
        create(args: {
            data: {
                notificationId: string;
                notificationCreatedAt: Date;
                originalEvent: Record<string, unknown>;
                failureReason: string;
                retryCount: number;
                lastError: string;
                classification: DlqFailureClassification;
            };
        }): Promise<DeadLetterEntry>;
    };
    notificationStateLog: {
        create(args: {
            data: {
                notificationId: string;
                notificationCreatedAt: Date;
                fromStatus: NotificationStatus;
                toStatus: "DLQ";
                actor: string;
                metadata: Record<string, unknown>;
            };
        }): Promise<unknown>;
    };
}

export interface DeadLetterQueueStore extends DlqTransaction {
    $transaction<T>(operation: (transaction: DlqTransaction) => Promise<T>): Promise<T>;
}

export class DlqNotificationNotFoundError extends Error {
    constructor(notificationId: string) {
        super(`Notification ${notificationId} was not found for DLQ processing`);
        this.name = "DlqNotificationNotFoundError";
    }
}

export class RetryNotExhaustedError extends Error {
    constructor(retryCount: number, maxRetries: number) {
        super(`Retry count ${retryCount} has not exhausted the maximum of ${maxRetries}`);
        this.name = "RetryNotExhaustedError";
    }
}

export type DlqConsumeResult =
    | { outcome: "ENQUEUED"; entry: DeadLetterEntry }
    | { outcome: "ALREADY_ENQUEUED"; entry: DeadLetterEntry };

/** Moves an exhausted retryable delivery to the durable dead-letter queue exactly once. */
export class DeadLetterQueueConsumer {
    constructor(
        private readonly store: DeadLetterQueueStore,
        private readonly classifier = new DlqFailureClassifier(),
    ) { }

    async consume(input: ExhaustedRetryNotification): Promise<DlqConsumeResult> {
        if (input.retryCount < input.maxRetries) {
            throw new RetryNotExhaustedError(input.retryCount, input.maxRetries);
        }

        return this.store.$transaction(async (transaction) => {
            const notification = await transaction.notification.findUnique({
                where: {
                    id_createdAt: {
                        id: input.notificationId,
                        createdAt: input.notificationCreatedAt,
                    },
                },
                select: { id: true, createdAt: true, status: true },
            });
            if (!notification) {
                throw new DlqNotificationNotFoundError(input.notificationId);
            }

            const existing = await transaction.deadLetterQueue.findFirst({
                where: {
                    notificationId: input.notificationId,
                    notificationCreatedAt: input.notificationCreatedAt,
                    resolved: false,
                },
                select: {
                    id: true,
                    notificationId: true,
                    notificationCreatedAt: true,
                    failureReason: true,
                    retryCount: true,
                    resolved: true,
                },
            });
            if (existing) return { outcome: "ALREADY_ENQUEUED", entry: existing };

            const entry = await transaction.deadLetterQueue.create({
                data: {
                    notificationId: input.notificationId,
                    notificationCreatedAt: input.notificationCreatedAt,
                    originalEvent: input.originalEvent,
                    failureReason: input.failure.failureCode,
                    retryCount: input.retryCount,
                    lastError: input.failure.failureReason,
                    classification: this.classifier.classify(input.failure),
                },
            });
            await transaction.notification.update({
                where: { id_createdAt: { id: notification.id, createdAt: notification.createdAt } },
                data: {
                    status: "DLQ",
                    deliveryAttempts: input.retryCount,
                    failedReason: input.failure.failureReason,
                    nextRetryAt: null,
                },
            });
            await transaction.notificationStateLog.create({
                data: {
                    notificationId: notification.id,
                    notificationCreatedAt: notification.createdAt,
                    fromStatus: notification.status,
                    toStatus: "DLQ",
                    actor: "retry-dlq-consumer",
                    metadata: {
                        retryCount: input.retryCount,
                        maxRetries: input.maxRetries,
                        failureCode: input.failure.failureCode,
                        retryable: input.failure.retryable,
                    },
                },
            });

            return { outcome: "ENQUEUED", entry };
        });
    }
}
