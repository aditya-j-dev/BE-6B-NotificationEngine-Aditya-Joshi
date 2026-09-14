import { describe, expect, it } from "vitest";

import type {
    DeliveryProvider,
    PreparedNotification,
} from "../delivery-provider";

const notification: PreparedNotification = {
    notificationId: "notification-1",
    eventId: "event-1",
    eventType: "TXNX-001",
    userId: "user-1",
    channel: "EMAIL",
    recipient: "investor@example.com",
    subject: "Order executed",
    content: "Your buy order was executed.",
};

const provider: DeliveryProvider = {
    send: async (preparedNotification) => {
        void preparedNotification;
        return {
            status: "ACCEPTED" as const,
            externalId: "email-1",
            acceptedAt: "2026-09-13T12:00:00.000Z",
        };
    },
    getStatus: async () => "DELIVERED" as const,
    validateRecipient: async (address: string) => ({
        valid: address === "investor@example.com",
        normalizedAddress: address.toLowerCase(),
    }),
    getQuota: async () => ({
        provider: "test-email",
        channel: "EMAIL" as const,
        limit: 100,
        remaining: 99,
        resetsAt: "2026-09-13T13:00:00.000Z",
    }),
} satisfies DeliveryProvider;

describe("DeliveryProvider contract", () => {
    it("supports sending a prepared notification and tracking the external delivery", async () => {
        const result = await provider.send(notification);

        expect(result).toEqual({
            status: "ACCEPTED",
            externalId: "email-1",
            acceptedAt: "2026-09-13T12:00:00.000Z",
        });
        expect(await provider.getStatus("email-1")).toBe("DELIVERED");
    });

    it("exposes recipient validation and provider quota through the shared contract", async () => {
        await expect(provider.validateRecipient("investor@example.com"))
            .resolves.toMatchObject({ valid: true });
        await expect(provider.getQuota()).resolves.toEqual({
            provider: "test-email",
            channel: "EMAIL",
            limit: 100,
            remaining: 99,
            resetsAt: "2026-09-13T13:00:00.000Z",
        });
    });
});
