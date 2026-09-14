import { describe, expect, it, vi } from "vitest";

import {
    FcmPushProvider,
    FcmPushProviderConfigurationError,
    createFcmPushProviderFromEnv,
    type FcmMessagingClient,
} from "../fcm-push-provider";

const registrationToken = "dF4j_3acRt5EuAiFoFcM94:APA91bH_test_token";
const push = {
    notificationId: "notification-1",
    eventId: "event-1",
    eventType: "RISK-002",
    userId: "user-1",
    channel: "PUSH" as const,
    recipient: registrationToken,
    title: "Margin shortfall",
    content: "Add funds before the deadline.",
    metadata: { deadline: "2026-09-15", retryCount: 1, nested: { ignored: true } },
};

function providerWith(send: FcmMessagingClient["send"]) {
    return new FcmPushProvider({ send } satisfies FcmMessagingClient, {
        projectId: "zetheta-dev",
    });
}

describe("FcmPushProvider", () => {
    it("sends an FCM v1 notification and serializes supported data fields", async () => {
        const send = vi.fn().mockResolvedValue("projects/zetheta-dev/messages/message-1");
        const provider = providerWith(send);

        await expect(provider.send(push)).resolves.toMatchObject({
            status: "SENT",
            externalId: "projects/zetheta-dev/messages/message-1",
        });
        expect(send).toHaveBeenCalledWith({
            token: registrationToken,
            notification: { title: "Margin shortfall", body: "Add funds before the deadline." },
            data: {
                notificationId: "notification-1",
                eventId: "event-1",
                eventType: "RISK-002",
                deadline: "2026-09-15",
                retryCount: "1",
            },
        });
    });

    it("returns a non-retryable failure for an invalid device token", async () => {
        const send = vi.fn();
        const provider = providerWith(send);

        await expect(provider.send({ ...push, recipient: "not-a-token" })).resolves.toMatchObject({
            status: "FAILED", failureCode: "INVALID_REGISTRATION_TOKEN", retryable: false,
        });
        expect(send).not.toHaveBeenCalled();
    });

    it("preserves Firebase error codes and identifies retryable FCM failures", async () => {
        const error = Object.assign(new Error("FCM unavailable"), {
            code: "messaging/server-unavailable",
        });
        const provider = providerWith(vi.fn().mockRejectedValue(error));

        await expect(provider.send(push)).resolves.toMatchObject({
            status: "FAILED",
            failureCode: "messaging/server-unavailable",
            retryable: true,
        });
    });

    it("enforces the PUSH channel and exposes common status, quota, and health operations", async () => {
        const provider = providerWith(vi.fn());

        await expect(provider.send({ ...push, channel: "EMAIL" }))
            .rejects.toBeInstanceOf(FcmPushProviderConfigurationError);
        await expect(provider.getStatus("message-1")).resolves.toBe("UNKNOWN");
        await expect(provider.getQuota()).resolves.toMatchObject({ channel: "PUSH", limit: null });
        await expect(provider.checkHealth()).resolves.toMatchObject({ status: "HEALTHY" });
    });

    it("requires Firebase environment configuration before creating the real provider", () => {
        expect(() => new FcmPushProvider({ send: vi.fn() }, { projectId: "" }))
            .toThrow(FcmPushProviderConfigurationError);
        expect(() => createFcmPushProviderFromEnv({})).toThrow(FcmPushProviderConfigurationError);
    });
});
