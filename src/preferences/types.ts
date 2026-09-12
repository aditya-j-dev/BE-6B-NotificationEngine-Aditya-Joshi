import type { NotificationChannel } from "../generated/prisma/enums";

export const EVENT_CATEGORIES = [
    "transaction",
    "risk_margin",
    "sip_investment",
    "market_price",
    "regulatory_compliance",
] as const;

export const DIGEST_MODES = ["immediate", "hourly", "daily"] as const;

export interface PreferenceInput {
    eventCategory: (typeof EVENT_CATEGORIES)[number];
    eventType: string;
    channel: NotificationChannel;
    enabled: boolean;
    quietHoursOverride: boolean;
    digestMode: (typeof DIGEST_MODES)[number];
    priorityOverride: number | null;
}

export interface UserPreferenceRecord extends PreferenceInput {
    userId: string;
}

export type PreferenceSource =
    | "SYSTEM_DEFAULT"
    | "SEGMENT_OVERRIDE"
    | "USER_PREFERENCE"
    | "REGULATORY_OVERRIDE";

export interface ResolvedPreference extends PreferenceInput {
    source: PreferenceSource;
    mandatory: boolean;
}
