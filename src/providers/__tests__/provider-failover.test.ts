import { describe, expect, it, vi } from "vitest";

import type { DeliveryProvider } from "../delivery-provider";
import {
    ProviderFailoverService,
    type NamedDeliveryProvider,
    type ProviderFailoverIdempotencyStore,
} from "../provider-failover";

const notification = {
    notificationId: "notification-1",
    eventId: "event-1",
    eventType: "TXNX-001",
    userId: "user-1",
    channel: "SMS" as const,
    recipient: "+919876543210",
    content: "Order executed.",
};

function provider(name: string, send: DeliveryProvider["send"]): NamedDeliveryProvider {
    return {
        provider: name,
        send,
        getStatus: async () => "UNKNOWN",
        validateRecipient: async () => ({ valid: true }),
        getQuota: async () => ({ provider: name, channel: "SMS", limit: null, remaining: null, resetsAt: null }),
    };
}

class MemoryIdempotencyStore implements ProviderFailoverIdempotencyStore {
    private readonly values = new Map<string, string>();

    async claim(key: string): Promise<boolean> {
        if (this.values.has(key)) return false;
        this.values.set(key, "IN_PROGRESS");
        return true;
    }

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null;
    }

    async complete(key: string, serializedResult: string): Promise<void> {
        this.values.set(key, serializedResult);
    }

    async release(key: string): Promise<void> {
        this.values.delete(key);
    }
}

describe("ProviderFailoverService", () => {
    it("falls back from MSG91 to Twilio after a retryable SMS failure", async () => {
        const msg91Send = vi.fn().mockResolvedValue({
            status: "FAILED", failureCode: "DOWN", failureReason: "down", retryable: true,
        });
        const twilioSend = vi.fn().mockResolvedValue({
            status: "SENT", externalId: "SM123", acceptedAt: "now",
        });
        const registered = new Map<string, NamedDeliveryProvider>([
            ["msg91", provider("msg91", msg91Send)],
            ["twilio", provider("twilio", twilioSend)],
        ]);
        const service = new ProviderFailoverService({ get: (name) => registered.get(name) });

        await expect(service.send(notification)).resolves.toMatchObject({
            delivered: true,
            selectedProvider: "twilio",
            attempts: [{ provider: "msg91" }, { provider: "twilio" }],
        });
        expect(msg91Send).toHaveBeenCalledOnce();
        expect(twilioSend).toHaveBeenCalledOnce();
    });

    it("skips an unconfigured primary provider and uses the available fallback", async () => {
        const twilioSend = vi.fn().mockResolvedValue({
            status: "SENT", externalId: "SM123", acceptedAt: "now",
        });
        const service = new ProviderFailoverService({
            get: (name) => name === "twilio" ? provider("twilio", twilioSend) : undefined,
        });

        await expect(service.send(notification)).resolves.toMatchObject({
            delivered: true,
            selectedProvider: "twilio",
            attempts: [
                { provider: "msg91", result: { failureCode: "PROVIDER_UNAVAILABLE" } },
                { provider: "twilio" },
            ],
        });
    });

    it("does not send through another provider for a permanent failure", async () => {
        const msg91Send = vi.fn().mockResolvedValue({
            status: "FAILED", failureCode: "INVALID_RECIPIENT", failureReason: "invalid", retryable: false,
        });
        const twilioSend = vi.fn();
        const registered = new Map<string, NamedDeliveryProvider>([
            ["msg91", provider("msg91", msg91Send)],
            ["twilio", provider("twilio", twilioSend)],
        ]);
        const service = new ProviderFailoverService({ get: (name) => registered.get(name) });

        await expect(service.send(notification)).resolves.toMatchObject({ delivered: false });
        expect(twilioSend).not.toHaveBeenCalled();
    });

    it("uses the FCM then APNS order for push notifications", async () => {
        const fcmSend = vi.fn().mockResolvedValue({
            status: "FAILED", failureCode: "DOWN", failureReason: "down", retryable: true,
        });
        const apnsSend = vi.fn().mockResolvedValue({
            status: "SENT", externalId: "apns-1", acceptedAt: "now",
        });
        const registered = new Map<string, NamedDeliveryProvider>([
            ["fcm", provider("fcm", fcmSend)],
            ["apns", provider("apns", apnsSend)],
        ]);
        const service = new ProviderFailoverService({ get: (name) => registered.get(name) });

        await expect(service.send({ ...notification, channel: "PUSH", recipient: "a_valid_fcm_token_value_123456789" })).resolves.toMatchObject({
            delivered: true,
            selectedProvider: "apns",
            attempts: [{ provider: "fcm" }, { provider: "apns" }],
        });
    });

    it("replays a completed simulation instead of sending through the provider chain twice", async () => {
        const twilioSend = vi.fn().mockResolvedValue({
            status: "SENT", externalId: "SM123", acceptedAt: "now",
        });
        const service = new ProviderFailoverService(
            { get: (name) => name === "twilio" ? provider("twilio", twilioSend) : undefined },
            undefined,
            new MemoryIdempotencyStore(),
        );

        await expect(service.send(notification, "simulation-1")).resolves.toMatchObject({ delivered: true });
        await expect(service.send(notification, "simulation-1")).resolves.toMatchObject({
            delivered: true,
            replayed: true,
            idempotencyKey: "simulation-1",
        });
        expect(twilioSend).toHaveBeenCalledOnce();
    });

    it("prevents a concurrent duplicate from sending while the original failover is in progress", async () => {
        let releaseSend!: (result: { status: "SENT"; externalId: string; acceptedAt: string }) => void;
        const twilioSend = vi.fn(() => new Promise<{ status: "SENT"; externalId: string; acceptedAt: string }>((resolve) => {
            releaseSend = resolve;
        }));
        const service = new ProviderFailoverService(
            { get: (name) => name === "twilio" ? provider("twilio", twilioSend) : undefined },
            undefined,
            new MemoryIdempotencyStore(),
        );

        const original = service.send(notification, "simulation-2");
        await vi.waitFor(() => expect(twilioSend).toHaveBeenCalledOnce());
        await expect(service.send(notification, "simulation-2")).resolves.toMatchObject({
            delivered: false,
            failure: { failureCode: "DELIVERY_IN_PROGRESS" },
        });
        releaseSend({ status: "SENT", externalId: "SM123", acceptedAt: "now" });
        await expect(original).resolves.toMatchObject({ delivered: true });
        expect(twilioSend).toHaveBeenCalledOnce();
    });

    it("releases a retryable failed chain so a later retry can safely run", async () => {
        const twilioSend = vi.fn()
            .mockResolvedValueOnce({ status: "FAILED", failureCode: "DOWN", failureReason: "down", retryable: true })
            .mockResolvedValueOnce({ status: "SENT", externalId: "SM123", acceptedAt: "now" });
        const service = new ProviderFailoverService(
            { get: (name) => name === "twilio" ? provider("twilio", twilioSend) : undefined },
            undefined,
            new MemoryIdempotencyStore(),
        );

        await expect(service.send(notification, "retry-1")).resolves.toMatchObject({ delivered: false });
        await expect(service.send(notification, "retry-1")).resolves.toMatchObject({ delivered: true });
        expect(twilioSend).toHaveBeenCalledTimes(2);
    });
});
