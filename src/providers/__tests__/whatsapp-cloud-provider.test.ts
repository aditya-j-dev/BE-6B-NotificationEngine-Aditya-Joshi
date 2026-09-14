import { describe, expect, it, vi } from "vitest";

import {
    WhatsAppCloudProvider,
    WhatsAppCloudProviderConfigurationError,
    createWhatsAppCloudProviderFromEnv,
    type WhatsAppHttpClient,
} from "../whatsapp-cloud-provider";

const notification = {
    notificationId: "notification-1",
    eventId: "event-1",
    eventType: "RISK-002",
    userId: "user-1",
    channel: "WHATSAPP" as const,
    recipient: "+91 95400 08006",
    content: "Margin shortfall requires action.",
};

function providerWith(response: { ok: boolean; status: number; payload: unknown }) {
    const httpClient: WhatsAppHttpClient = vi.fn().mockResolvedValue({
        ok: response.ok,
        status: response.status,
        json: async () => response.payload,
    });
    return {
        provider: new WhatsAppCloudProvider({
            accessToken: "test-token",
            phoneNumberId: "1342965412229578",
            apiVersion: "v25.0",
            apiBaseUrl: "https://graph.test",
        }, httpClient),
        httpClient,
    };
}

describe("WhatsAppCloudProvider", () => {
    it("sends a WhatsApp text message and normalizes the recipient number", async () => {
        const fixture = providerWith({
            ok: true,
            status: 200,
            payload: { messages: [{ id: "wamid.message-1" }] },
        });

        await expect(fixture.provider.send(notification)).resolves.toMatchObject({
            status: "SENT", externalId: "wamid.message-1",
        });
        expect(fixture.httpClient).toHaveBeenCalledWith(
            "https://graph.test/v25.0/1342965412229578/messages",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: "919540008006",
                    type: "text",
                    text: { body: "Margin shortfall requires action." },
                }),
            }),
        );
    });

    it("parses Graph API failures and marks rate limits as retryable", async () => {
        const { provider } = providerWith({
            ok: false,
            status: 429,
            payload: { error: { code: 4, message: "Rate limit exceeded", error_subcode: 123 } },
        });

        await expect(provider.send(notification)).resolves.toMatchObject({
            status: "FAILED",
            failureCode: "4",
            failureReason: "Rate limit exceeded",
            retryable: true,
            providerMetadata: { metaSubcode: 123 },
        });
    });

    it("rejects invalid recipients without calling Meta", async () => {
        const fixture = providerWith({ ok: true, status: 200, payload: {} });

        await expect(fixture.provider.send({ ...notification, recipient: "not-a-phone" }))
            .resolves.toMatchObject({ status: "FAILED", failureCode: "INVALID_RECIPIENT" });
        expect(fixture.httpClient).not.toHaveBeenCalled();
    });

    it("enforces its channel and exposes common status, quota, and health operations", async () => {
        const { provider, httpClient } = providerWith({ ok: true, status: 200, payload: {} });

        await expect(provider.send({ ...notification, channel: "SMS" }))
            .rejects.toBeInstanceOf(WhatsAppCloudProviderConfigurationError);
        await expect(provider.getStatus("wamid.message-1")).resolves.toBe("UNKNOWN");
        await expect(provider.getQuota()).resolves.toMatchObject({ channel: "WHATSAPP", limit: null });
        await expect(provider.checkHealth()).resolves.toMatchObject({ status: "HEALTHY" });
        expect(httpClient).toHaveBeenCalledWith(
            "https://graph.test/v25.0/1342965412229578?fields=id",
            expect.objectContaining({ method: "GET" }),
        );
    });

    it("requires WhatsApp environment configuration", () => {
        expect(() => new WhatsAppCloudProvider({ accessToken: "", phoneNumberId: "123" }))
            .toThrow(WhatsAppCloudProviderConfigurationError);
        expect(() => createWhatsAppCloudProviderFromEnv({}))
            .toThrow(WhatsAppCloudProviderConfigurationError);
    });
});
