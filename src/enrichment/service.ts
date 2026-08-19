import { PrismaClient } from "../generated/prisma/client";
import { NotificationChannel } from "../generated/prisma/enums";

import type { FinancialEvent } from "../events/types";

import {
    EVENT_CHANNEL_POLICY,
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

        const channels = this.resolveChannels(
            event,
            preferences,
        );

        return {
            event,
            user,
            channels,
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
            },
        });

        if (!user) {
            throw new Error(
                `User ${userId} not found`,
            );
        }

        return user;
    }

    private resolveChannels(
        event: FinancialEvent,
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

        /*
         * Layer 2:
         * Segment overrides.
         *
         * No segment model currently exists in the database,
         * so this layer intentionally has no overrides.
         */

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
                    source: "SYSTEM_DEFAULT",
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