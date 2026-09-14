import { describe, expect, it, vi } from "vitest";

import {
    SocketIoInAppProvider,
    SocketIoInAppProviderConfigurationError,
    type InAppSocketServer,
} from "../socketio-in-app-provider";

const notification = {
    notificationId: "notification-1",
    eventId: "event-1",
    eventType: "TXNX-001",
    userId: "user-1",
    channel: "IN_APP" as const,
    recipient: "user-1",
    title: "Order executed",
    content: "Your purchase order was executed.",
    metadata: { orderId: "order-1" },
};

function socketServer() {
    const emit = vi.fn().mockReturnValue(true);
    const to = vi.fn().mockReturnValue({ emit });
    return { io: { to } satisfies InAppSocketServer, to, emit };
}

describe("SocketIoInAppProvider", () => {
    it("emits a structured notification to the authenticated user's room", async () => {
        const fixture = socketServer();
        const provider = new SocketIoInAppProvider(fixture.io);

        await expect(provider.send(notification)).resolves.toMatchObject({
            status: "SENT", externalId: "socketio:notification-1",
        });
        expect(fixture.to).toHaveBeenCalledWith("user:user-1");
        expect(fixture.emit).toHaveBeenCalledWith("notification", {
            notificationId: "notification-1",
            eventId: "event-1",
            eventType: "TXNX-001",
            title: "Order executed",
            content: "Your purchase order was executed.",
            metadata: { orderId: "order-1" },
        });
    });

    it("does not emit when the recipient is empty or belongs to another user", async () => {
        const fixture = socketServer();
        const provider = new SocketIoInAppProvider(fixture.io);

        await expect(provider.send({ ...notification, recipient: "" })).resolves.toMatchObject({
            status: "FAILED", failureCode: "INVALID_RECIPIENT",
        });
        await expect(provider.send({ ...notification, recipient: "user-2" })).resolves.toMatchObject({
            status: "FAILED", failureCode: "RECIPIENT_USER_MISMATCH",
        });
        expect(fixture.emit).not.toHaveBeenCalled();
    });

    it("returns a retryable failure when Socket.io cannot emit", async () => {
        const io: InAppSocketServer = {
            to: () => ({
                emit: () => {
                    throw new Error("Socket server unavailable");
                },
            }),
        };
        const provider = new SocketIoInAppProvider(io);

        await expect(provider.send(notification)).resolves.toMatchObject({
            status: "FAILED", failureCode: "SOCKETIO_EMIT_FAILED", retryable: true,
        });
    });

    it("enforces the IN_APP channel and supports common provider operations", async () => {
        const provider = new SocketIoInAppProvider(socketServer().io);

        await expect(provider.send({ ...notification, channel: "PUSH" }))
            .rejects.toBeInstanceOf(SocketIoInAppProviderConfigurationError);
        await expect(provider.getStatus("socketio:notification-1")).resolves.toBe("UNKNOWN");
        await expect(provider.getQuota()).resolves.toMatchObject({ channel: "IN_APP", limit: null });
        await expect(provider.checkHealth()).resolves.toMatchObject({ status: "HEALTHY" });
    });
});
