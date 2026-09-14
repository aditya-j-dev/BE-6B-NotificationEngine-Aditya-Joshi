import { describe, expect, it, vi } from "vitest";

import {
    DeliveryAcknowledgementService,
    normalizeTwilioCallback,
    normalizeWhatsAppCallback,
    type DeliveryAcknowledgementStore,
    type NotificationForAcknowledgement,
} from "..";

function createStore(notification: NotificationForAcknowledgement | null) {
    const callbacks = new Set<string>();
    const update = vi.fn();
    const stateLog = vi.fn();

    const transaction = {
        deliveryAcknowledgement: {
            findUnique: vi.fn(async ({ where }) => callbacks.has(
                `${where.provider_callbackId.provider}:${where.provider_callbackId.callbackId}`,
            ) ? { id: "existing" } : null),
            create: vi.fn(async ({ data }) => {
                callbacks.add(`${data.provider}:${data.callbackId}`);
                return { id: "ack-1", ...data };
            }),
        },
        notification: {
            findFirst: vi.fn(async () => notification),
            update,
        },
        notificationStateLog: { create: stateLog },
    };

    return {
        $transaction: async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction),
        ...transaction,
        update,
        stateLog,
    } as unknown as DeliveryAcknowledgementStore & { update: ReturnType<typeof vi.fn>; stateLog: ReturnType<typeof vi.fn> };
}

const sentNotification: NotificationForAcknowledgement = {
    id: "notification-1",
    createdAt: new Date("2026-09-15T10:00:00.000Z"),
    status: "SENT",
    provider: "twilio",
    externalId: "SM123",
};

describe("DeliveryAcknowledgementService", () => {
    it("persists a delivery callback and advances the matched notification", async () => {
        const store = createStore(sentNotification);
        const service = new DeliveryAcknowledgementService(store);

        const result = await service.record({
            callbackId: "event-1",
            provider: "twilio",
            externalId: "SM123",
            status: "DELIVERED",
            providerStatus: "delivered",
            occurredAt: new Date("2026-09-15T10:01:00.000Z"),
        });

        expect(result).toEqual({
            outcome: "APPLIED",
            status: "DELIVERED",
            notificationId: "notification-1",
        });
        expect(store.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: "DELIVERED", deliveredAt: new Date("2026-09-15T10:01:00.000Z") },
        }));
        expect(store.stateLog).toHaveBeenCalledOnce();
    });

    it("ignores a replay with the same provider callback ID", async () => {
        const service = new DeliveryAcknowledgementService(createStore(sentNotification));
        const callback = {
            callbackId: "event-1",
            provider: "twilio",
            externalId: "SM123",
            status: "DELIVERED" as const,
            providerStatus: "delivered",
            occurredAt: new Date("2026-09-15T10:01:00.000Z"),
        };

        await service.record(callback);
        await expect(service.record(callback)).resolves.toEqual({
            outcome: "DUPLICATE",
            status: "DELIVERED",
        });
    });

    it("does not let a late sent callback regress a delivered notification", async () => {
        const store = createStore({ ...sentNotification, status: "DELIVERED" });
        const service = new DeliveryAcknowledgementService(store);

        await expect(service.record({
            callbackId: "event-2",
            provider: "twilio",
            externalId: "SM123",
            status: "SENT",
            providerStatus: "sent",
            occurredAt: new Date(),
        })).resolves.toMatchObject({ outcome: "IGNORED" });
        expect(store.update).not.toHaveBeenCalled();
    });

    it("keeps unmatched provider callbacks for investigation", async () => {
        const store = createStore(null);
        const service = new DeliveryAcknowledgementService(store);

        await expect(service.record({
            callbackId: "event-3",
            provider: "twilio",
            externalId: "unknown",
            status: "FAILED",
            providerStatus: "undelivered",
            occurredAt: new Date(),
        })).resolves.toEqual({ outcome: "UNMATCHED", status: "FAILED" });
    });
});

describe("provider callback normalization", () => {
    it("normalizes Twilio and WhatsApp delivery payloads", () => {
        expect(normalizeTwilioCallback({
            MessageSid: "SM123",
            MessageStatus: "delivered",
            Timestamp: "2026-09-15T10:01:00.000Z",
            EventSid: "EV123",
        })).toMatchObject({ callbackId: "EV123", externalId: "SM123", status: "DELIVERED" });

        expect(normalizeWhatsAppCallback({
            id: "wamid.123",
            status: "read",
            timestamp: "1789466460",
        })).toMatchObject({ externalId: "wamid.123", status: "READ" });
    });
});
