import type { NotificationChannel } from "../generated/prisma/enums";
import type { EventPriority } from "../events/types";
import type { EnrichedEvent } from "../enrichment/types";

export interface RoutedChannel {
    channel: NotificationChannel;
    priority: EventPriority;
    mandatory: boolean;
    source:
    | "SYSTEM_DEFAULT"
    | "SEGMENT_OVERRIDE"
    | "USER_PREFERENCE"
    | "REGULATORY_OVERRIDE";
}

export interface RoutingDecision {
    eventId: string;
    eventType: string;
    userId: string;
    priority: EventPriority;
    routes: RoutedChannel[];
    enrichedEvent: EnrichedEvent;
}