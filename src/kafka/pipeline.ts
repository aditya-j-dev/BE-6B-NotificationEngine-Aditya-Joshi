import type { FinancialEvent } from "../events/types";
import {
    EventDeduplicationService,
} from "../deduplication/service";
import {
    EventEnrichmentService,
} from "../enrichment/service";
import {
    EventRoutingService,
} from "../routing/service";
import type {
    RoutingDecision,
} from "../routing/types";

export interface PipelineResult {
    duplicate: boolean;
    routingDecision?: RoutingDecision;
}

export class NotificationPipeline {
    constructor(
        private readonly deduplication:
            EventDeduplicationService,
        private readonly enrichment:
            EventEnrichmentService,
        private readonly routing:
            EventRoutingService,
    ) { }

    async process(
        event: FinancialEvent,
    ): Promise<PipelineResult> {
        /*
         * Deduplicate before doing any expensive
         * downstream work.
         */
        const duplicate =
            await this.deduplication.isDuplicate(
                event.eventId,
            );

        if (duplicate) {
            return {
                duplicate: true,
            };
        }

        /*
         * Enrich the validated event with:
         * - user context
         * - preferences
         * - regulatory channel rules
         */
        const enriched =
            await this.enrichment.enrich(event);

        /*
         * Convert the enriched event into an
         * ordered routing decision.
         */
        const routingDecision =
            this.routing.route(enriched);

        return {
            duplicate: false,
            routingDecision,
        };
    }
}