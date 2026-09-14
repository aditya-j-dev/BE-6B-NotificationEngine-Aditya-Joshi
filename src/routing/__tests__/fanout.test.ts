import { describe, expect, it, vi } from "vitest";

import { NotificationChannel } from "../../generated/prisma/enums";
import type { DeliveryProvider } from "../../providers/delivery-provider";
import { MultiChannelFanoutService } from "../fanout";
import type { RoutingDecision, RoutedChannel } from "../types";

function route(channel: NotificationChannel, mandatory = false): RoutedChannel {
    return {
        channel,
        priority: "HIGH",
        mandatory,
        score: 100,
        scoreBreakdown: {
            regulatory: 0,
            userPreference: 0,
            deliveryOptimization: 100,
            costOptimization: 0,
        },
        source: "SYSTEM_DEFAULT",
    };
}

function decision(routes: RoutedChannel[]): RoutingDecision {
    return {
        eventId: "event-1",
        eventType: "TXNX-001",
        userId: "user-1",
        priority: "HIGH",
        routes,
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
        getQuota: async () => ({
            provider: "test", channel: "EMAIL", limit: null, remaining: null, resetsAt: null,
        }),
    };
}

describe("MultiChannelFanoutService", () => {
    it("starts all selected channel deliveries concurrently", async () => {
        let release!: () => void;
        const pending = new Promise<void>((resolve) => { release = resolve; });
        const emailSend = vi.fn().mockImplementation(async () => {
            await pending;
            return { status: "SENT", externalId: "email-1", acceptedAt: "now" };
        });
        const smsSend = vi.fn().mockImplementation(async () => {
            await pending;
            return { status: "SENT", externalId: "sms-1", acceptedAt: "now" };
        });
        const providers = new Map<NotificationChannel, DeliveryProvider>([
            [NotificationChannel.EMAIL, provider(emailSend)],
            [NotificationChannel.SMS, provider(smsSend)],
        ]);
        const service = new MultiChannelFanoutService({ get: (channel) => providers.get(channel) });

        const result = service.dispatch(decision([
            route(NotificationChannel.EMAIL), route(NotificationChannel.SMS, true),
        ]), { notification: {
            notificationId: "notification-1", eventId: "event-1", eventType: "TXNX-001", userId: "user-1", content: "Order executed.",
        } });

        await Promise.resolve();
        expect(emailSend).toHaveBeenCalledOnce();
        expect(smsSend).toHaveBeenCalledOnce();
        release();
        await expect(result).resolves.toHaveLength(2);
    });

    it("uses safe default recipients and explicit device tokens per channel", async () => {
        const emailSend = vi.fn().mockResolvedValue({ status: "SENT", externalId: "email-1", acceptedAt: "now" });
        const pushSend = vi.fn().mockResolvedValue({ status: "SENT", externalId: "push-1", acceptedAt: "now" });
        const providers = new Map<NotificationChannel, DeliveryProvider>([
            [NotificationChannel.EMAIL, provider(emailSend)],
            [NotificationChannel.PUSH, provider(pushSend)],
        ]);
        const service = new MultiChannelFanoutService({ get: (channel) => providers.get(channel) });

        await service.dispatch(decision([route(NotificationChannel.EMAIL), route(NotificationChannel.PUSH)]), {
            notification: { notificationId: "notification-1", eventId: "event-1", eventType: "TXNX-001", userId: "user-1", content: "Order executed." },
            recipients: { PUSH: "registration-token-1234567890" },
        });

        expect(emailSend).toHaveBeenCalledWith(expect.objectContaining({ recipient: "investor@example.com" }));
        expect(pushSend).toHaveBeenCalledWith(expect.objectContaining({ recipient: "registration-token-1234567890" }));
    });

    it("records an individual failure without cancelling simultaneous deliveries", async () => {
        const emailSend = vi.fn().mockResolvedValue({
            status: "FAILED", failureCode: "SMTP_DOWN", failureReason: "SMTP unavailable", retryable: true,
        });
        const smsSend = vi.fn().mockResolvedValue({ status: "SENT", externalId: "sms-1", acceptedAt: "now" });
        const providers = new Map<NotificationChannel, DeliveryProvider>([
            [NotificationChannel.EMAIL, provider(emailSend)],
            [NotificationChannel.SMS, provider(smsSend)],
        ]);
        const service = new MultiChannelFanoutService({ get: (channel) => providers.get(channel) });

        const results = await service.dispatch(decision([
            route(NotificationChannel.EMAIL), route(NotificationChannel.SMS, true),
        ]), { notification: {
            notificationId: "notification-1", eventId: "event-1", eventType: "TXNX-001", userId: "user-1", content: "Order executed.",
        } });

        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({ channel: "EMAIL", result: expect.objectContaining({ status: "FAILED" }) }),
            expect.objectContaining({ channel: "SMS", mandatory: true, result: expect.objectContaining({ status: "SENT" }) }),
        ]));
    });

    it("returns explicit failures for missing providers or missing push tokens", async () => {
        const service = new MultiChannelFanoutService({ get: () => undefined });

        const results = await service.dispatch(decision([
            route(NotificationChannel.EMAIL), route(NotificationChannel.PUSH),
        ]), { notification: {
            notificationId: "notification-1", eventId: "event-1", eventType: "TXNX-001", userId: "user-1", content: "Order executed.",
        } });

        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({ channel: "EMAIL", result: expect.objectContaining({ failureCode: "NO_CHANNEL_PROVIDER" }) }),
            expect.objectContaining({ channel: "PUSH", result: expect.objectContaining({ failureCode: "NO_CHANNEL_RECIPIENT" }) }),
        ]));
    });
});
