import type { NotificationChannel } from "../generated/prisma/enums";
import type { DeliveryResult, PreparedNotification } from "../providers/delivery-provider";
import { resolveDeliveryRecipient } from "./delivery-target";
import type { DeliveryProviderRegistry, FanoutInput } from "./fanout";
import type { RoutingDecision, RoutedChannel } from "./types";

export interface ChannelFailoverAttempt {
    channel: NotificationChannel;
    route: RoutedChannel;
    result: DeliveryResult;
}

export interface ChannelFailoverResult {
    delivered: boolean;
    selectedChannel?: NotificationChannel;
    attempts: ChannelFailoverAttempt[];
}

/**
 * Attempts ranked channels in order. It is for single-delivery routing; events
 * requiring simultaneous delivery use MultiChannelFanoutService instead.
 */
export class ChannelFailoverService {
    constructor(private readonly providers: DeliveryProviderRegistry) { }

    async dispatch(
        decision: RoutingDecision,
        input: FanoutInput,
    ): Promise<ChannelFailoverResult> {
        const attempts: ChannelFailoverAttempt[] = [];

        for (const route of decision.routes) {
            const result = await this.dispatchRoute(route, decision, input);
            attempts.push({ channel: route.channel, route, result });

            if (result.status !== "FAILED") {
                return {
                    delivered: true,
                    selectedChannel: route.channel,
                    attempts,
                };
            }
        }

        return { delivered: false, attempts };
    }

    private async dispatchRoute(
        route: RoutedChannel,
        decision: RoutingDecision,
        input: FanoutInput,
    ): Promise<DeliveryResult> {
        const recipient = resolveDeliveryRecipient(route.channel, decision, input.recipients);
        if (!recipient) {
            return this.failure("NO_CHANNEL_RECIPIENT", "No recipient is available for this channel");
        }
        const provider = this.providers.get(route.channel);
        if (!provider) {
            return this.failure("NO_CHANNEL_PROVIDER", "No provider is registered for this channel");
        }

        try {
            return await provider.send({
                ...input.notification,
                channel: route.channel,
                recipient,
            } as PreparedNotification);
        } catch (error) {
            return this.failure(
                "PROVIDER_DISPATCH_EXCEPTION",
                error instanceof Error ? error.message : "Provider dispatch failed",
                true,
            );
        }
    }

    private failure(
        failureCode: string,
        failureReason: string,
        retryable = false,
    ): DeliveryResult {
        return { status: "FAILED", failureCode, failureReason, retryable };
    }
}
