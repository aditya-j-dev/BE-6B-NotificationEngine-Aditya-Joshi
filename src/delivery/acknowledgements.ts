import type { NotificationStatus } from "../generated/prisma/enums";

export type ProviderCallbackStatus =
    | "QUEUED"
    | "SENT"
    | "DELIVERED"
    | "READ"
    | "FAILED"
    | "BOUNCED";

export interface DeliveryAcknowledgementInput {
    /** Stable provider event identifier. Replays with this ID are ignored. */
    callbackId: string;
    provider: string;
    externalId: string;
    status: ProviderCallbackStatus;
    occurredAt: Date;
    providerStatus: string;
    payload?: Record<string, unknown>;
}

export interface NotificationForAcknowledgement {
    id: string;
    createdAt: Date;
    status: NotificationStatus;
    provider: string | null;
    externalId: string | null;
}

export interface DeliveryAcknowledgementRecord extends DeliveryAcknowledgementInput {
    id: string;
    notificationId: string | null;
    notificationCreatedAt: Date | null;
}

interface AcknowledgementTransaction {
    deliveryAcknowledgement: {
        findUnique(args: {
            where: { provider_callbackId: { provider: string; callbackId: string } };
        }): Promise<{ id: string } | null>;
        create(args: { data: Omit<DeliveryAcknowledgementRecord, "id"> }): Promise<DeliveryAcknowledgementRecord>;
    };
    notification: {
        findFirst(args: {
            where: { provider: string; externalId: string };
            orderBy: { createdAt: "desc" };
        }): Promise<NotificationForAcknowledgement | null>;
        update(args: {
            where: { id_createdAt: { id: string; createdAt: Date } };
            data: {
                status: NotificationStatus;
                deliveredAt?: Date;
                readAt?: Date;
                failedReason?: string;
            };
        }): Promise<unknown>;
    };
    notificationStateLog: {
        create(args: {
            data: {
                notificationId: string;
                notificationCreatedAt: Date;
                fromStatus: NotificationStatus;
                toStatus: NotificationStatus;
                actor: string;
                metadata: Record<string, unknown>;
            };
        }): Promise<unknown>;
    };
}

export interface DeliveryAcknowledgementStore extends AcknowledgementTransaction {
    $transaction<T>(operation: (transaction: AcknowledgementTransaction) => Promise<T>): Promise<T>;
}

export type AcknowledgementOutcome = "APPLIED" | "DUPLICATE" | "UNMATCHED" | "IGNORED";

export interface AcknowledgementResult {
    outcome: AcknowledgementOutcome;
    status: ProviderCallbackStatus;
    notificationId?: string;
}

const STATE_RANK: Partial<Record<NotificationStatus, number>> = {
    QUEUED: 1,
    SENT: 2,
    DELIVERED: 3,
    READ: 4,
};

function shouldApply(current: NotificationStatus, incoming: ProviderCallbackStatus): boolean {
    if (current === "READ" || current === "DLQ") {
        return false;
    }

    if (incoming === "FAILED" || incoming === "BOUNCED") {
        return current !== "DELIVERED";
    }

    const currentRank = STATE_RANK[current] ?? 0;
    return (STATE_RANK[incoming] ?? 0) > currentRank;
}

/**
 * Stores every unique provider callback, then updates the matched notification
 * only when the callback advances its delivery state. This makes retries and
 * out-of-order webhooks safe to replay.
 */
export class DeliveryAcknowledgementService {
    constructor(private readonly store: DeliveryAcknowledgementStore) { }

    async record(input: DeliveryAcknowledgementInput): Promise<AcknowledgementResult> {
        return this.store.$transaction(async (transaction) => {
            const duplicate = await transaction.deliveryAcknowledgement.findUnique({
                where: {
                    provider_callbackId: {
                        provider: input.provider,
                        callbackId: input.callbackId,
                    },
                },
            });

            if (duplicate) {
                return { outcome: "DUPLICATE", status: input.status };
            }

            const notification = await transaction.notification.findFirst({
                where: { provider: input.provider, externalId: input.externalId },
                orderBy: { createdAt: "desc" },
            });

            await transaction.deliveryAcknowledgement.create({
                data: {
                    ...input,
                    notificationId: notification?.id ?? null,
                    notificationCreatedAt: notification?.createdAt ?? null,
                },
            });

            if (!notification) {
                return { outcome: "UNMATCHED", status: input.status };
            }

            if (!shouldApply(notification.status, input.status)) {
                return {
                    outcome: "IGNORED",
                    status: input.status,
                    notificationId: notification.id,
                };
            }

            const data = this.toNotificationUpdate(input);
            await transaction.notification.update({
                where: { id_createdAt: { id: notification.id, createdAt: notification.createdAt } },
                data,
            });
            await transaction.notificationStateLog.create({
                data: {
                    notificationId: notification.id,
                    notificationCreatedAt: notification.createdAt,
                    fromStatus: notification.status,
                    toStatus: input.status,
                    actor: `provider-callback:${input.provider}`,
                    metadata: {
                        callbackId: input.callbackId,
                        externalId: input.externalId,
                        providerStatus: input.providerStatus,
                    },
                },
            });

            return { outcome: "APPLIED", status: input.status, notificationId: notification.id };
        });
    }

    private toNotificationUpdate(input: DeliveryAcknowledgementInput): {
        status: NotificationStatus;
        deliveredAt?: Date;
        readAt?: Date;
        failedReason?: string;
    } {
        if (input.status === "DELIVERED") {
            return { status: input.status, deliveredAt: input.occurredAt };
        }

        if (input.status === "READ") {
            return { status: input.status, readAt: input.occurredAt };
        }

        if (input.status === "FAILED" || input.status === "BOUNCED") {
            return { status: input.status, failedReason: input.providerStatus };
        }

        return { status: input.status };
    }
}
