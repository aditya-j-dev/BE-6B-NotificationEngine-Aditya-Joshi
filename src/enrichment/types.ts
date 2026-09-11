import type { NotificationChannel } from "../generated/prisma/enums";
import type { FinancialEvent } from "../events/types";
import type { UserSegment } from "./channel-policy";

export interface UserContext {
    id: string;
    phone: string;
    email: string;
    name: string | null;
    language: string;
    timezone: string;
    segment: UserSegment;
}

export interface ChannelPerformance {
    deliveryRate: number;
    averageLatencyMs: number;
}

export interface ResolvedChannel {
    channel: NotificationChannel;
    source:
    | "SYSTEM_DEFAULT"
    | "SEGMENT_OVERRIDE"
    | "USER_PREFERENCE"
    | "REGULATORY_OVERRIDE";
    mandatory: boolean;
}

export interface EnrichedEvent {
    event: FinancialEvent;
    user: UserContext;
    channels: ResolvedChannel[];
    channelPerformance: Partial<
        Record<NotificationChannel, ChannelPerformance>
    >;
}
