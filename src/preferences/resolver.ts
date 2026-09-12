import type { EventCategory } from "../events/types";
import type { NotificationChannel } from "../generated/prisma/enums";
import {
    EVENT_CHANNEL_POLICY,
    SEGMENT_CHANNEL_OVERRIDES,
    type UserSegment,
} from "../enrichment/channel-policy";

import type {
    PreferenceInput,
    ResolvedPreference,
} from "./types";

const SYSTEM_PREFERENCE: Omit<PreferenceInput, "eventCategory" | "eventType" | "channel"> = {
    enabled: true,
    quietHoursOverride: false,
    digestMode: "immediate",
    priorityOverride: null,
};

export interface PreferenceResolutionInput {
    eventType: string;
    eventCategory: EventCategory;
    segment: UserSegment;
    userPreferences: PreferenceInput[];
}

export class MissingChannelPolicyError extends Error {
    constructor(readonly eventType: string) {
        super(`No channel policy configured for ${eventType}`);
        this.name = "MissingChannelPolicyError";
    }
}

/**
 * Resolves notification preferences in their required precedence order:
 * system default, segment, user, then mandatory regulatory policy.
 */
export class PreferenceHierarchyResolver {
    resolve(input: PreferenceResolutionInput): ResolvedPreference[] {
        const policy = EVENT_CHANNEL_POLICY[input.eventType];

        if (!policy) {
            throw new MissingChannelPolicyError(input.eventType);
        }

        const resolved = new Map<NotificationChannel, ResolvedPreference>();
        const addSystemChannel = (
            channel: NotificationChannel,
            source: ResolvedPreference["source"],
        ): void => {
            if (!resolved.has(channel)) {
                resolved.set(channel, {
                    eventCategory: input.eventCategory,
                    eventType: input.eventType,
                    channel,
                    ...SYSTEM_PREFERENCE,
                    source,
                    mandatory: false,
                });
            }
        };

        for (const channel of policy.defaultChannels) {
            addSystemChannel(channel, "SYSTEM_DEFAULT");
        }

        const segmentChannels = SEGMENT_CHANNEL_OVERRIDES[input.segment]?.[
            input.eventCategory
        ] ?? [];
        for (const channel of segmentChannels) {
            addSystemChannel(channel, "SEGMENT_OVERRIDE");
        }

        for (const preference of this.userPreferencesFor(input)) {
            if (!preference.enabled) {
                resolved.delete(preference.channel);
                continue;
            }

            resolved.set(preference.channel, {
                ...preference,
                source: "USER_PREFERENCE",
                mandatory: false,
            });
        }

        for (const channel of policy.regulatoryChannels) {
            resolved.set(channel, {
                eventCategory: input.eventCategory,
                eventType: input.eventType,
                channel,
                ...SYSTEM_PREFERENCE,
                source: "REGULATORY_OVERRIDE",
                mandatory: true,
            });
        }

        return [...resolved.values()];
    }

    private userPreferencesFor(
        input: PreferenceResolutionInput,
    ): PreferenceInput[] {
        const preferencesByChannel = new Map<
            NotificationChannel,
            PreferenceInput
        >();

        for (const preference of input.userPreferences) {
            if (
                preference.eventCategory === input.eventCategory &&
                preference.eventType === "*"
            ) {
                preferencesByChannel.set(preference.channel, preference);
            }
        }

        for (const preference of input.userPreferences) {
            if (
                preference.eventCategory === input.eventCategory &&
                preference.eventType === input.eventType
            ) {
                preferencesByChannel.set(preference.channel, preference);
            }
        }

        return [...preferencesByChannel.values()];
    }
}
