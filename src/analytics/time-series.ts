import type { NotificationChannel, NotificationStatus } from "../generated/prisma/enums";

const TERMINAL_DELIVERY_STATUSES: NotificationStatus[] = ["DELIVERED", "FAILED", "BOUNCED"];

export type AnalyticsTimeBucket = "HOUR" | "DAY";

export interface TimeSeriesQuery {
    from: Date;
    to: Date;
    bucket: AnalyticsTimeBucket;
    channel?: NotificationChannel;
}

export interface TimeSeriesLog {
    notificationId: string;
    notificationCreatedAt: Date;
    toStatus: NotificationStatus;
    createdAt: Date;
    notification: { channel: NotificationChannel };
}

export interface TimeSeriesAnalyticsStore {
    notificationStateLog: {
        findMany(args: {
            where: {
                createdAt: { gte: Date; lte: Date };
                toStatus: { in: NotificationStatus[] };
                notification?: { is: { channel: NotificationChannel } };
            };
            orderBy: { createdAt: "asc" };
            select: {
                notificationId: true;
                notificationCreatedAt: true;
                toStatus: true;
                createdAt: true;
                notification: { select: { channel: true } };
            };
        }): Promise<TimeSeriesLog[]>;
    };
}

export interface TimeSeriesPoint {
    bucketStart: string;
    bucket: AnalyticsTimeBucket;
    channel: NotificationChannel;
    delivered: number;
    failed: number;
    terminalNotifications: number;
    deliveryRate: number;
}

/**
 * Aggregates append-only state transitions by time bucket. Its bounded
 * createdAt query is backed by NotificationStateLog_createdAt_brin_idx.
 */
export class TimeSeriesAnalyticsService {
    constructor(private readonly store: TimeSeriesAnalyticsStore) { }

    async aggregate(query: TimeSeriesQuery): Promise<TimeSeriesPoint[]> {
        if (query.from > query.to) throw new Error("Time-series start must not be after its end");
        const logs = await this.store.notificationStateLog.findMany({
            where: {
                createdAt: { gte: query.from, lte: query.to },
                toStatus: { in: TERMINAL_DELIVERY_STATUSES },
                ...(query.channel ? { notification: { is: { channel: query.channel } } } : {}),
            },
            orderBy: { createdAt: "asc" },
            select: {
                notificationId: true,
                notificationCreatedAt: true,
                toStatus: true,
                createdAt: true,
                notification: { select: { channel: true } },
            },
        });
        const finalLogs = new Map<string, TimeSeriesLog>();
        logs.forEach((log) => finalLogs.set(this.notificationKey(log), log));

        const aggregates = new Map<string, Omit<TimeSeriesPoint, "deliveryRate">>();
        finalLogs.forEach((log) => {
            const bucketStart = this.bucketStart(log.createdAt, query.bucket).toISOString();
            const key = `${bucketStart}:${log.notification.channel}`;
            const aggregate = aggregates.get(key) ?? {
                bucketStart,
                bucket: query.bucket,
                channel: log.notification.channel,
                delivered: 0,
                failed: 0,
                terminalNotifications: 0,
            };
            if (log.toStatus === "DELIVERED") aggregate.delivered += 1;
            else aggregate.failed += 1;
            aggregate.terminalNotifications += 1;
            aggregates.set(key, aggregate);
        });
        return [...aggregates.values()].map((aggregate) => ({
            ...aggregate,
            deliveryRate: aggregate.delivered / aggregate.terminalNotifications,
        })).sort((left, right) => left.bucketStart.localeCompare(right.bucketStart) || left.channel.localeCompare(right.channel));
    }

    private notificationKey(log: TimeSeriesLog): string {
        return `${log.notificationId}:${log.notificationCreatedAt.toISOString()}`;
    }

    private bucketStart(timestamp: Date, bucket: AnalyticsTimeBucket): Date {
        const start = new Date(timestamp);
        start.setUTCMinutes(0, 0, 0);
        if (bucket === "DAY") start.setUTCHours(0);
        return start;
    }
}
