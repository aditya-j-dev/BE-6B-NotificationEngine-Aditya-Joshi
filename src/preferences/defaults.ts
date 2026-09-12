import type { EventCategory } from "../events/types";
import { EVENT_CHANNEL_POLICY } from "../enrichment/channel-policy";

import type { PreferenceInput, UserPreferenceRecord } from "./types";

function categoryForEventType(eventType: string): EventCategory {
    if (eventType.startsWith("TXNX-")) {
        return "transaction";
    }

    if (eventType.startsWith("RISK-")) {
        return "risk_margin";
    }

    if (eventType.startsWith("SIPX-")) {
        return "sip_investment";
    }

    if (eventType.startsWith("MKTX-")) {
        return "market_price";
    }

    if (eventType.startsWith("REGX-")) {
        return "regulatory_compliance";
    }

    throw new Error(`Cannot infer event category for ${eventType}`);
}

/** Default, editable preferences derived from the system channel matrix. */
export const DEFAULT_PREFERENCE_DEFINITIONS: PreferenceInput[] = Object.entries(
    EVENT_CHANNEL_POLICY,
).flatMap(([eventType, policy]) =>
    policy.defaultChannels.map((channel) => ({
        eventCategory: categoryForEventType(eventType),
        eventType,
        channel,
        enabled: true,
        quietHoursOverride: false,
        digestMode: "immediate",
        priorityOverride: null,
    })),
);

export function defaultPreferencesForUser(
    userId: string,
): UserPreferenceRecord[] {
    return DEFAULT_PREFERENCE_DEFINITIONS.map((preference) => ({
        userId,
        ...preference,
    }));
}
