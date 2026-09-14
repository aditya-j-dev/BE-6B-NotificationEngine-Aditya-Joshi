import type { EnrichedEvent } from "../enrichment/types";
import type {
    RoutingDecision,
    RoutedChannel,
} from "./types";
import { PriorityWeightedChannelScorer } from "./scoring";

export class EventRoutingService {
    constructor(
        private readonly scorer = new PriorityWeightedChannelScorer(),
    ) { }

    route(
        enrichedEvent: EnrichedEvent,
    ): RoutingDecision {
        const routes: RoutedChannel[] =
            [...enrichedEvent.channels]
                .map((resolvedChannel) => {
                    const score = this.scorer.score(
                        resolvedChannel,
                        enrichedEvent.event.priority,
                        enrichedEvent.channelPerformance?.[resolvedChannel.channel],
                    );
                    return { resolvedChannel, score };
                })
                .sort((left, right) => right.score.total - left.score.total)
                .map(({ resolvedChannel, score }) => ({
                    channel:
                        resolvedChannel.channel,

                    priority:
                        enrichedEvent.event.priority,

                    mandatory:
                        resolvedChannel.mandatory,

                    score: score.total,
                    scoreBreakdown: score.breakdown,

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
