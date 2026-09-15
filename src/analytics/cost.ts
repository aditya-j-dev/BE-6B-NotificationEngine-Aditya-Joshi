import type { NotificationChannel, NotificationStatus } from "../generated/prisma/enums";

export interface CostAnalyticsQuery {
    from?: Date;
    to?: Date;
    channel?: NotificationChannel;
    provider?: string;
}

export interface CostAnalyticsStore {
    notification: {
        findMany(args: {
            where: {
                costPaisa: { not: null };
                createdAt?: { gte?: Date; lte?: Date };
                channel?: NotificationChannel;
                provider?: string;
            };
            select: { channel: true; provider: true; status: true; costPaisa: true };
        }): Promise<Array<{
            channel: NotificationChannel;
            provider: string | null;
            status: NotificationStatus;
            costPaisa: number | null;
        }>>;
    };
}

export interface ChannelCostMetrics {
    channel: NotificationChannel;
    provider: string;
    billedNotifications: number;
    deliveredNotifications: number;
    totalCostPaisa: number;
    totalCostInr: number;
    averageCostPaisa: number;
    costPerDeliveredPaisa: number;
}

/** Aggregates the immutable per-notification provider cost recorded in paisa. */
export class CostAnalyticsService {
    constructor(private readonly store: CostAnalyticsStore) { }

    async metrics(query: CostAnalyticsQuery = {}): Promise<ChannelCostMetrics[]> {
        const notifications = await this.store.notification.findMany({
            where: {
                costPaisa: { not: null },
                ...(query.from || query.to ? {
                    createdAt: {
                        ...(query.from ? { gte: query.from } : {}),
                        ...(query.to ? { lte: query.to } : {}),
                    },
                } : {}),
                ...(query.channel ? { channel: query.channel } : {}),
                ...(query.provider ? { provider: query.provider } : {}),
            },
            select: { channel: true, provider: true, status: true, costPaisa: true },
        });
        const aggregates = new Map<string, Omit<ChannelCostMetrics, "totalCostInr" | "averageCostPaisa" | "costPerDeliveredPaisa">>();
        notifications.forEach((notification) => {
            const provider = notification.provider ?? "UNASSIGNED";
            const key = `${notification.channel}:${provider}`;
            const aggregate = aggregates.get(key) ?? {
                channel: notification.channel,
                provider,
                billedNotifications: 0,
                deliveredNotifications: 0,
                totalCostPaisa: 0,
            };
            aggregate.billedNotifications += 1;
            aggregate.totalCostPaisa += notification.costPaisa ?? 0;
            if (notification.status === "DELIVERED") aggregate.deliveredNotifications += 1;
            aggregates.set(key, aggregate);
        });
        return [...aggregates.values()].map((aggregate) => ({
            ...aggregate,
            totalCostInr: aggregate.totalCostPaisa / 100,
            averageCostPaisa: aggregate.totalCostPaisa / aggregate.billedNotifications,
            costPerDeliveredPaisa: aggregate.deliveredNotifications === 0
                ? 0
                : aggregate.totalCostPaisa / aggregate.deliveredNotifications,
        })).sort((left, right) => left.channel.localeCompare(right.channel) || left.provider.localeCompare(right.provider));
    }
}
