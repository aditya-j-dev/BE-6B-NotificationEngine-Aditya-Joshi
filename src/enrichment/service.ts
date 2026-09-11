import { PrismaClient } from "../generated/prisma/client";
import { NotificationChannel } from "../generated/prisma/enums";

import type { FinancialEvent } from "../events/types";

import {
    EVENT_CHANNEL_POLICY,
    SEGMENT_CHANNEL_OVERRIDES,
    type UserSegment,
} from "./channel-policy";

import type {
    EnrichedEvent,
    ResolvedChannel,
    UserContext,
} from "./types";

export class EventEnrichmentService {
    constructor(
        private readonly prisma: PrismaClient,
    ) { }

    async enrich(
        event: FinancialEvent,
    ): Promise<EnrichedEvent> {
        const user = await this.resolveUserContext(
            event.userId,
        );

        const preferences =
            await this.prisma.userPreference.findMany({
                where: {
                    userId: event.userId,
                },
            });

        const performance =
            await this.prisma.userChannelPerformance?.findMany({
                where: { userId: event.userId },
            }) ?? [];

        const channels = this.resolveChannels(
            event,
            user.segment,
            preferences,
        );

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

    private async resolveUserContext(
        userId: string,
    ): Promise<UserContext> {
        const user = await this.prisma.user.findUnique({
            where: {
                id: userId,
            },
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
            throw new Error(
                `User ${userId} not found`,
            );
        }

        return {
            ...user,
            segment: this.isUserSegment(user.segment)
                ? user.segment
                : "STANDARD",
        };
    }

    private isUserSegment(
        value: string,
    ): value is UserSegment {
        return [
            "STANDARD",
            "PREMIUM",
            "ACTIVE_TRADER",
            "PASSIVE_INVESTOR",
        ].includes(value);
    }

    private resolveChannels(
        event: FinancialEvent,
        segment: UserSegment,
        preferences: Array<{
            eventCategory: string;
            eventType: string;
            channel: NotificationChannel;
            enabled: boolean;
        }>,
    ): ResolvedChannel[] {
        const policy =
            EVENT_CHANNEL_POLICY[event.eventType];

        if (!policy) {
            throw new Error(
                `No channel policy configured for ${event.eventType}`,
            );
        }

        /*
         * Layer 1:
         * System defaults from the event/channel decision matrix.
         */
        const systemChannels =
            new Set(policy.defaultChannels);

        const segmentChannels =
            SEGMENT_CHANNEL_OVERRIDES[segment]?.[
                event.eventCategory
            ] ?? [];

        for (const channel of segmentChannels) {
            systemChannels.add(channel);
        }

        /*
         * Layer 3:
         * User preferences.
         *
         * Event-specific preference takes precedence over
         * category-level "*" preference.
         */
        const resolved = new Map<
            NotificationChannel,
            ResolvedChannel
        >();

        for (const channel of systemChannels) {
            const exactPreference =
                preferences.find(
                    (preference) =>
                        preference.eventType ===
                        event.eventType &&
                        preference.channel === channel,
                );

            const categoryPreference =
                preferences.find(
                    (preference) =>
                        preference.eventType === "*" &&
                        preference.eventCategory ===
                        event.eventCategory &&
                        preference.channel === channel,
                );

            const preference =
                exactPreference ??
                categoryPreference;

            /*
             * No user preference:
             * retain the system default.
             */
            if (!preference) {
                resolved.set(channel, {
                    channel,
                    source: segmentChannels.includes(channel)
                        ? "SEGMENT_OVERRIDE"
                        : "SYSTEM_DEFAULT",
                    mandatory: false,
                });

                continue;
            }

            /*
             * Explicit user preference.
             */
            if (preference.enabled) {
                resolved.set(channel, {
                    channel,
                    source: "USER_PREFERENCE",
                    mandatory: false,
                });
            }
        }

        /*
         * Layer 4:
         * Regulatory override.
         *
         * Mandatory channels always win over user preferences.
         */
        for (const channel of policy.regulatoryChannels) {
            resolved.set(channel, {
                channel,
                source: "REGULATORY_OVERRIDE",
                mandatory: true,
            });
        }

        return Array.from(resolved.values());
    }
}
