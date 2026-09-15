import type { ConsentType } from "../generated/prisma/enums";
import type { NotificationChannel } from "../generated/prisma/enums";

import type { ChannelMetricsSnapshotSource } from "./prometheus";
import { CostAnalyticsService, type CostAnalyticsQuery } from "./cost";
import { EventSourcedAnalyticsService, type EventSourcedAnalyticsQuery } from "./event-sourced";

export interface OptOutTrendStore {
    consentAuditLog: {
        findMany(args: {
            where: { action: "OPT_OUT"; createdAt?: { gte?: Date; lte?: Date } };
            orderBy: { createdAt: "asc" };
            select: { consentType: true; createdAt: true };
        }): Promise<Array<{ consentType: ConsentType; createdAt: Date }>>;
    };
}

export interface OptOutTrendPoint {
    date: string;
    consentType: ConsentType;
    count: number;
}

/** Read model shared by the dashboard analytics API endpoints. */
export class AnalyticsApiService {
    constructor(
        private readonly eventSourced: EventSourcedAnalyticsService,
        private readonly channelMetrics: ChannelMetricsSnapshotSource,
        private readonly optOutStore: OptOutTrendStore,
        private readonly costAnalytics?: CostAnalyticsService,
    ) { }

    deliveryRates(query: EventSourcedAnalyticsQuery = {}) {
        return this.eventSourced.deliveryMetrics(query);
    }

    async channelPerformance(channels: readonly NotificationChannel[]): Promise<Awaited<ReturnType<ChannelMetricsSnapshotSource["snapshot"]>>[]> {
        return Promise.all(channels.map((channel) => this.channelMetrics.snapshot(channel)));
    }

    async optOutTrends(from?: Date, to?: Date): Promise<OptOutTrendPoint[]> {
        const records = await this.optOutStore.consentAuditLog.findMany({
            where: {
                action: "OPT_OUT",
                ...(from || to ? {
                    createdAt: {
                        ...(from ? { gte: from } : {}),
                        ...(to ? { lte: to } : {}),
                    },
                } : {}),
            },
            orderBy: { createdAt: "asc" },
            select: { consentType: true, createdAt: true },
        });
        const counts = new Map<string, OptOutTrendPoint>();
        records.forEach((record) => {
            const date = record.createdAt.toISOString().slice(0, 10);
            const key = `${date}:${record.consentType}`;
            const current = counts.get(key) ?? { date, consentType: record.consentType, count: 0 };
            current.count += 1;
            counts.set(key, current);
        });
        return [...counts.values()];
    }

    costs(query: CostAnalyticsQuery = {}) {
        if (!this.costAnalytics) throw new Error("COST_ANALYTICS_UNAVAILABLE");
        return this.costAnalytics.metrics(query);
    }
}
