import type { EventPriority } from "../events/types";
import type { ChannelPerformance, ResolvedChannel } from "../enrichment/types";
import type { NotificationChannel } from "../generated/prisma/enums";

export interface ChannelScoreBreakdown {
    regulatory: number;
    userPreference: number;
    deliveryOptimization: number;
    costOptimization: number;
}

export interface ChannelScore {
    total: number;
    breakdown: ChannelScoreBreakdown;
}

export interface ChannelScoringPolicy {
    channelCostPaisa: Record<NotificationChannel, number>;
    sourceWeight: Record<ResolvedChannel["source"], number>;
    latencyPenaltyDivisorMs: number;
    maximumLatencyPenalty: number;
    costMultiplierByPriority: Record<EventPriority, number>;
}

/**
 * Weights mirror Part A §A3.2's ordering. Regulatory requirements outweigh
 * preferences, preferences outweigh delivery performance, and cost only breaks
 * ties among otherwise comparable non-urgent channels.
 */
export const DEFAULT_CHANNEL_SCORING_POLICY: ChannelScoringPolicy = {
    channelCostPaisa: {
        SMS: 70,
        EMAIL: 2,
        PUSH: 1,
        WHATSAPP: 55,
        IN_APP: 0,
    },
    sourceWeight: {
        REGULATORY_OVERRIDE: 10_000,
        USER_PREFERENCE: 1_000,
        SEGMENT_OVERRIDE: 500,
        SYSTEM_DEFAULT: 0,
    },
    latencyPenaltyDivisorMs: 100,
    maximumLatencyPenalty: 25,
    costMultiplierByPriority: {
        CRITICAL: 0,
        HIGH: 0.25,
        NORMAL: 0.75,
        LOW: 1,
        VERY_LOW: 1,
    },
};

export class PriorityWeightedChannelScorer {
    constructor(private readonly policy = DEFAULT_CHANNEL_SCORING_POLICY) { }

    score(
        channel: ResolvedChannel,
        priority: EventPriority,
        performance: ChannelPerformance | undefined,
    ): ChannelScore {
        const resolvedPerformance = performance ?? {
            deliveryRate: 0.5,
            averageLatencyMs: 1_000,
        };
        const regulatory = channel.source === "REGULATORY_OVERRIDE"
            ? this.policy.sourceWeight.REGULATORY_OVERRIDE
            : 0;
        const userPreference = channel.source === "REGULATORY_OVERRIDE"
            ? 0
            : this.policy.sourceWeight[channel.source];
        const deliveryOptimization = (resolvedPerformance.deliveryRate * 100)
            - Math.min(
                resolvedPerformance.averageLatencyMs / this.policy.latencyPenaltyDivisorMs,
                this.policy.maximumLatencyPenalty,
            );
        const costMultiplier = this.policy.costMultiplierByPriority[priority];
        const costOptimization = costMultiplier === 0
            ? 0
            : -this.policy.channelCostPaisa[channel.channel] * costMultiplier;
        const breakdown = {
            regulatory,
            userPreference,
            deliveryOptimization,
            costOptimization,
        };

        return {
            total: Object.values(breakdown).reduce((total, value) => total + value, 0),
            breakdown,
        };
    }
}
