import type { NotificationChannel } from "../generated/prisma/enums";
import type {
    DeliveryProvider,
    DeliveryResult,
    PreparedNotification,
} from "../providers/delivery-provider";
import type { RoutingDecision, RoutedChannel } from "./types";
import { resolveDeliveryRecipient } from "./delivery-target";

export interface DeliveryProviderRegistry {
    get(channel: NotificationChannel): DeliveryProvider | undefined;
}

export interface FanoutInput {
    notification: Omit<PreparedNotification, "channel" | "recipient">;
    recipients?: Partial<Record<NotificationChannel, string>>;
}

export interface FanoutResult {
    channel: NotificationChannel;
    mandatory: boolean;
    route: RoutedChannel;
    result: DeliveryResult;
}

/**
 * Dispatches every selected route concurrently. A failed channel is recorded in
 * its own result and never cancels other required simultaneous deliveries.
 */
export class MultiChannelFanoutService {
    constructor(private readonly providers: DeliveryProviderRegistry) { }

    async dispatch(
        decision: RoutingDecision,
        input: FanoutInput,
    ): Promise<FanoutResult[]> {
        return Promise.all(decision.routes.map((route) => this.dispatchRoute(
            route,
            decision,
            input,
        )));
    }

    private async dispatchRoute(
        route: RoutedChannel,
        decision: RoutingDecision,
        input: FanoutInput,
    ): Promise<FanoutResult> {
        const recipient = resolveDeliveryRecipient(route.channel, decision, input.recipients);
        if (!recipient) {
            return this.failedResult(route, "NO_CHANNEL_RECIPIENT", "No recipient is available for this channel");
        }

        const provider = this.providers.get(route.channel);
        if (!provider) {
            return this.failedResult(route, "NO_CHANNEL_PROVIDER", "No provider is registered for this channel");
        }

        try {
            const result = await provider.send({
                ...input.notification,
                channel: route.channel,
                recipient,
            });
            return { channel: route.channel, mandatory: route.mandatory, route, result };
        } catch (error) {
            return this.failedResult(
                route,
                "PROVIDER_DISPATCH_EXCEPTION",
                error instanceof Error ? error.message : "Provider dispatch failed",
            );
        }
    }

    private failedResult(
        route: RoutedChannel,
        failureCode: string,
        failureReason: string,
    ): FanoutResult {
        return {
            channel: route.channel,
            mandatory: route.mandatory,
            route,
            result: {
                status: "FAILED",
                failureCode,
                failureReason,
                retryable: false,
            },
        };
    }
}
