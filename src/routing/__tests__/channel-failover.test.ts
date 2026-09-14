import { describe, expect, it, vi } from "vitest";

import { NotificationChannel } from "../../generated/prisma/enums";
import type { DeliveryProvider } from "../../providers/delivery-provider";
import { ChannelFailoverService } from "../channel-failover";
import type { DeliveryProviderRegistry } from "../fanout";
import type { RoutingDecision, RoutedChannel } from "../types";

function route(channel: NotificationChannel, score: number): RoutedChannel {
    return {
        channel,
        priority: "HIGH",
        mandatory: false,
        score,
        scoreBreakdown: { regulatory: 0, userPreference: 0, deliveryOptimization: score, costOptimization: 0 },
        source: "SYSTEM_DEFAULT",
    };
}

function decision(routes: RoutedChannel[]): RoutingDecision {
    return {
        eventId: "event-1", eventType: "TXNX-001", userId: "user-1", priority: "HIGH", routes,
        enrichedEvent: {
            event: { priority: "HIGH", eventId: "event-1", eventType: "TXNX-001", userId: "user-1" },
            user: { id: "user-1", phone: "+919876543210", email: "investor@example.com" },
        },
    } as unknown as RoutingDecision;
}

function provider(send: DeliveryProvider["send"]): DeliveryProvider {
    return {
        send,
        getStatus: async () => "UNKNOWN",
        validateRecipient: async () => ({ valid: true }),
        getQuota: async () => ({ provider: "test", channel: "EMAIL", limit: null, remaining: null, resetsAt: null }),
    };
}

function registry(entries: Array<[NotificationChannel, DeliveryProvider]>): DeliveryProviderRegistry {
    const providers = new Map<NotificationChannel, DeliveryProvider>(entries);
    return { get: (channel) => providers.get(channel) };
}

const input = {
    notification: {
        notificationId: "notification-1", eventId: "event-1", eventType: "TXNX-001", userId: "user-1", content: "Order executed.",
    },
};

describe("ChannelFailoverService", () => {
    it("moves to the next-best channel when the primary delivery fails", async () => {
        const emailSend = vi.fn().mockResolvedValue({
            status: "FAILED", failureCode: "SMTP_DOWN", failureReason: "SMTP unavailable", retryable: true,
        });
        const pushSend = vi.fn().mockResolvedValue({ status: "SENT", externalId: "push-1", acceptedAt: "now" });
        const service = new ChannelFailoverService(registry([
            [NotificationChannel.EMAIL, provider(emailSend)],
            [NotificationChannel.PUSH, provider(pushSend)],
        ]));

        const result = await service.dispatch(decision([
            route(NotificationChannel.EMAIL, 100), route(NotificationChannel.PUSH, 90),
        ]), { ...input, recipients: { PUSH: "registration-token-1234567890" } });

        expect(result).toMatchObject({ delivered: true, selectedChannel: "PUSH" });
        expect(result.attempts.map(({ channel }) => channel)).toEqual(["EMAIL", "PUSH"]);
        expect(emailSend).toHaveBeenCalledBefore(pushSend as ReturnType<typeof vi.fn>);
    });

    it("stops after the primary channel accepts delivery", async () => {
        const emailSend = vi.fn().mockResolvedValue({ status: "SENT", externalId: "email-1", acceptedAt: "now" });
        const smsSend = vi.fn();
        const service = new ChannelFailoverService(registry([
            [NotificationChannel.EMAIL, provider(emailSend)],
            [NotificationChannel.SMS, provider(smsSend)],
        ]));

        const result = await service.dispatch(decision([
            route(NotificationChannel.EMAIL, 100), route(NotificationChannel.SMS, 90),
        ]), input);

        expect(result.attempts).toHaveLength(1);
        expect(smsSend).not.toHaveBeenCalled();
    });

    it("continues after missing providers, recipients, and provider exceptions", async () => {
        const smsSend = vi.fn().mockResolvedValue({ status: "SENT", externalId: "sms-1", acceptedAt: "now" });
        const service = new ChannelFailoverService(registry([
            [NotificationChannel.EMAIL, provider(async () => { throw new Error("SMTP crashed"); })],
            [NotificationChannel.SMS, provider(smsSend)],
        ]));

        const result = await service.dispatch(decision([
            route(NotificationChannel.PUSH, 100),
            route(NotificationChannel.EMAIL, 90),
            route(NotificationChannel.SMS, 80),
        ]), input);

        expect(result).toMatchObject({ delivered: true, selectedChannel: "SMS" });
        expect(result.attempts.map(({ result: attempt }) => attempt.status)).toEqual(["FAILED", "FAILED", "SENT"]);
        expect(result.attempts[0]?.result).toMatchObject({ failureCode: "NO_CHANNEL_RECIPIENT" });
        expect(result.attempts[1]?.result).toMatchObject({ failureCode: "PROVIDER_DISPATCH_EXCEPTION" });
    });

    it("returns every failed attempt when no eligible channel accepts delivery", async () => {
        const service = new ChannelFailoverService(registry([]));

        const result = await service.dispatch(decision([
            route(NotificationChannel.EMAIL, 100), route(NotificationChannel.SMS, 90),
        ]), input);

        expect(result.delivered).toBe(false);
        expect(result.attempts).toHaveLength(2);
        expect(result.attempts.every(({ result: attempt }) => attempt.status === "FAILED")).toBe(true);
    });
});
