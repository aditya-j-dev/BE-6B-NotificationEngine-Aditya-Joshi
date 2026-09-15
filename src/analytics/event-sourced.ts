import type { NotificationChannel, NotificationStatus } from "../generated/prisma/enums";

const TERMINAL_DELIVERY_STATUSES: NotificationStatus[] = ["DELIVERED", "FAILED", "BOUNCED"];

export interface EventSourcedAnalyticsQuery {
    from?: Date;
    to?: Date;
    channel?: NotificationChannel;
}

export interface NotificationStateLogForAnalytics {
    notificationId: string;
    notificationCreatedAt: Date;
    toStatus: NotificationStatus;
    createdAt: Date;
    notification: {
        channel: NotificationChannel;
        createdAt: Date;
    };
}

export interface EventSourcedAnalyticsStore {
    notificationStateLog: {
        findMany(args: {
            where: {
                createdAt?: { gte?: Date; lte?: Date };
                toStatus: { in: NotificationStatus[] };
                notification?: { is: { channel: NotificationChannel } };
            };
            orderBy: { createdAt: "asc" };
            select: {
                notificationId: true;
                notificationCreatedAt: true;
                toStatus: true;
                createdAt: true;
                notification: { select: { channel: true; createdAt: true } };
            };
        }): Promise<NotificationStateLogForAnalytics[]>;
    };
}

export interface EventSourcedChannelMetrics {
    channel: NotificationChannel;
    delivered: number;
    failed: number;
    terminalNotifications: number;
    deliveryRate: number;
    averageDeliveryLatencyMs: number;
}

/** Derives final delivery outcomes from the immutable notification state-log. */
export class EventSourcedAnalyticsService {
    constructor(private readonly store: EventSourcedAnalyticsStore) { }

    async deliveryMetrics(query: EventSourcedAnalyticsQuery = {}): Promise<EventSourcedChannelMetrics[]> {
        const logs = await this.store.notificationStateLog.findMany({
            where: {
                ...(query.from || query.to ? {
                    createdAt: {
                        ...(query.from ? { gte: query.from } : {}),
                        ...(query.to ? { lte: query.to } : {}),
                    },
                } : {}),
                toStatus: { in: TERMINAL_DELIVERY_STATUSES },
                ...(query.channel ? { notification: { is: { channel: query.channel } } } : {}),
            },
            orderBy: { createdAt: "asc" },
            select: {
                notificationId: true,
                notificationCreatedAt: true,
                toStatus: true,
                createdAt: true,
                notification: { select: { channel: true, createdAt: true } },
            },
        });

        const latestByNotification = new Map<string, NotificationStateLogForAnalytics>();
        logs.forEach((log) => {
            latestByNotification.set(this.notificationKey(log), log);
        });

        const byChannel = new Map<NotificationChannel, {
            delivered: number;
            failed: number;
            deliveryLatencyTotalMs: number;
        }>();
        latestByNotification.forEach((log) => {
            const aggregate = byChannel.get(log.notification.channel) ?? {
                delivered: 0,
                failed: 0,
                deliveryLatencyTotalMs: 0,
            };
            if (log.toStatus === "DELIVERED") {
                aggregate.delivered += 1;
                aggregate.deliveryLatencyTotalMs += Math.max(0, log.createdAt.getTime() - log.notification.createdAt.getTime());
            } else {
                aggregate.failed += 1;
            }
            byChannel.set(log.notification.channel, aggregate);
        });

        return [...byChannel.entries()].map(([channel, aggregate]) => {
            const terminalNotifications = aggregate.delivered + aggregate.failed;
            return {
                channel,
                delivered: aggregate.delivered,
                failed: aggregate.failed,
                terminalNotifications,
                deliveryRate: terminalNotifications === 0 ? 0 : aggregate.delivered / terminalNotifications,
                averageDeliveryLatencyMs: aggregate.delivered === 0 ? 0 : aggregate.deliveryLatencyTotalMs / aggregate.delivered,
            };
        }).sort((left, right) => left.channel.localeCompare(right.channel));
    }

    private notificationKey(log: NotificationStateLogForAnalytics): string {
        return `${log.notificationId}:${log.notificationCreatedAt.toISOString()}`;
    }
}
