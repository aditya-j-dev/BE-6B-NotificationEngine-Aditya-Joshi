import { PrismaClient } from "../generated/prisma/client";

import type { FinancialEvent } from "../events/types";
import {
    PreferenceHierarchyResolver,
    type PreferenceInput,
} from "../preferences";

import type { UserSegment } from "./channel-policy";
import type { EnrichedEvent, UserContext } from "./types";

export class EventEnrichmentService {
    private readonly preferenceResolver = new PreferenceHierarchyResolver();

    constructor(
        private readonly prisma: PrismaClient,
    ) { }

    async enrich(event: FinancialEvent): Promise<EnrichedEvent> {
        const user = await this.resolveUserContext(event.userId);
        const preferences = await this.prisma.userPreference.findMany({
            where: { userId: event.userId },
        });
        const performance = await this.prisma.userChannelPerformance?.findMany({
            where: { userId: event.userId },
        }) ?? [];

        const channels = this.preferenceResolver.resolve({
            eventType: event.eventType,
            eventCategory: event.eventCategory,
            segment: user.segment,
            userPreferences: this.toPreferenceInputs(preferences),
        }).map(({ channel, source, mandatory }) => ({
            channel,
            source,
            mandatory,
        }));

        return {
            event,
            user,
            channels,
            channelPerformance: Object.fromEntries(
                performance.map((metric) => [
                    metric.channel,
                    {
                        deliveryRate: metric.deliveryRate,
                        averageLatencyMs: metric.averageLatencyMs,
                    },
                ]),
            ),
        };
    }

    private async resolveUserContext(userId: string): Promise<UserContext> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                phone: true,
                email: true,
                name: true,
                language: true,
                timezone: true,
                segment: true,
            },
        });

        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        return {
            ...user,
            segment: this.isUserSegment(user.segment) ? user.segment : "STANDARD",
        };
    }

    private isUserSegment(value: string): value is UserSegment {
        return [
            "STANDARD",
            "PREMIUM",
            "ACTIVE_TRADER",
            "PASSIVE_INVESTOR",
        ].includes(value);
    }

    private toPreferenceInputs(
        preferences: Array<{
            eventCategory: string;
            eventType: string;
            channel: PreferenceInput["channel"];
            enabled: boolean;
            quietHoursOverride?: boolean;
            digestMode?: string;
            priorityOverride?: number | null;
        }>,
    ): PreferenceInput[] {
        const eventCategories = new Set<PreferenceInput["eventCategory"]>([
            "transaction",
            "risk_margin",
            "sip_investment",
            "market_price",
            "regulatory_compliance",
        ]);
        const digestModes = new Set<PreferenceInput["digestMode"]>([
            "immediate",
            "hourly",
            "daily",
        ]);

        return preferences.flatMap((preference) => {
            const eventCategory = preference.eventCategory as PreferenceInput["eventCategory"];
            const digestMode = preference.digestMode as PreferenceInput["digestMode"];

            if (!eventCategories.has(eventCategory)) {
                return [];
            }

            return [{
                eventCategory,
                eventType: preference.eventType,
                channel: preference.channel,
                enabled: preference.enabled,
                quietHoursOverride: preference.quietHoursOverride ?? false,
                digestMode: digestModes.has(digestMode) ? digestMode : "immediate",
                priorityOverride: preference.priorityOverride ?? null,
            }];
        });
    }
}
