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
                    return this.scoreChannel(b, enrichedEvent) -
                        this.scoreChannel(a, enrichedEvent);
                })
                .map((resolvedChannel) => ({
                    channel:
                        resolvedChannel.channel,

                    priority:
                        enrichedEvent.event.priority,

                    mandatory:
                        resolvedChannel.mandatory,

                    score: this.scoreChannel(
                        resolvedChannel,
                        enrichedEvent,
                    ),

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

    private scoreChannel(
        channel: EnrichedEvent["channels"][number],
        enrichedEvent: EnrichedEvent,
    ): number {
        const performance = enrichedEvent.channelPerformance?.[
            channel.channel
        ] ?? { deliveryRate: 0.5, averageLatencyMs: 1000 };

        const sourceBonus = {
            SYSTEM_DEFAULT: 0,
            SEGMENT_OVERRIDE: 15,
            USER_PREFERENCE: 30,
            REGULATORY_OVERRIDE: 1000,
        } as const;

        const costPenalty = {
            SMS: 20,
            EMAIL: 4,
            PUSH: 0,
            WHATSAPP: 55,
            IN_APP: 0,
        } as const;

        return sourceBonus[channel.source] +
            (performance.deliveryRate * 100) -
            Math.min(performance.averageLatencyMs / 100, 25) -
            costPenalty[channel.channel];
    }
}
