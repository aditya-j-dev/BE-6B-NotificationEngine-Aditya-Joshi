import type { EnrichedEvent } from "../enrichment/types";
import type {
    RoutingDecision,
    RoutedChannel,
} from "./types";

export class EventRoutingService {
    route(
        enrichedEvent: EnrichedEvent,
    ): RoutingDecision {
        const routes: RoutedChannel[] =
            [...enrichedEvent.channels]
                .sort((a, b) => {
                    /*
                     * Routing precedence for Day 3:
                     *
                     * 1. Regulatory override
                     * 2. Explicit user preference
                     * 3. System default
                     *
                     * This reflects the decision hierarchy
                     * without implementing the later weighted
                     * scoring model.
                     */
                    const precedence = {
                        REGULATORY_OVERRIDE: 0,
                        USER_PREFERENCE: 1,
                        SEGMENT_OVERRIDE: 2,
                        SYSTEM_DEFAULT: 3,
                    } as const;

                    return (
                        precedence[a.source] -
                        precedence[b.source]
                    );
                })
                .map((resolvedChannel) => ({
                    channel:
                        resolvedChannel.channel,

                    priority:
                        enrichedEvent.event.priority,

                    mandatory:
                        resolvedChannel.mandatory,

                    source:
                        resolvedChannel.source,
                }));

        if (routes.length === 0) {
            throw new Error(
                `No eligible delivery channels for event ${enrichedEvent.event.eventType}`,
            );
        }

        return {
            eventId:
                enrichedEvent.event.eventId,

            eventType:
                enrichedEvent.event.eventType,

            userId:
                enrichedEvent.event.userId,

            priority:
                enrichedEvent.event.priority,

            routes,

            enrichedEvent,
        };
    }
}