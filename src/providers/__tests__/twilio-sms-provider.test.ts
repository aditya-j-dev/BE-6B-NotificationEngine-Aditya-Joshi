import { describe, expect, it, vi } from "vitest";

import {
    TwilioSmsProvider,
    TwilioSmsProviderConfigurationError,
    createTwilioSmsProviderFromEnv,
    type TwilioHttpClient,
} from "../twilio-sms-provider";

const sms = {
    notificationId: "notification-1",
    eventId: "event-1",
    eventType: "RISK-002",
    userId: "user-1",
    channel: "SMS" as const,
    recipient: "+919876543210",
    content: "Margin shortfall requires action.",
};

function providerWith(response: { ok: boolean; status: number; payload: unknown }) {
    const httpClient: TwilioHttpClient = vi.fn().mockResolvedValue({
        ok: response.ok,
        status: response.status,
        json: async () => response.payload,
    });
    return {
        provider: new TwilioSmsProvider({
            accountSid: "ACtest",
            authToken: "test-token",
            fromPhone: "+15005550006",
            apiBaseUrl: "https://twilio.test",
        }, httpClient),
        httpClient,
    };
}

describe("TwilioSmsProvider", () => {
    it("submits an SMS with basic authentication and parses an accepted response", async () => {
        const fixture = providerWith({
            ok: true,
            status: 201,
            payload: { sid: "SM123", status: "queued", date_created: "2026-09-14T08:00:00.000Z" },
        });

        await expect(fixture.provider.send(sms)).resolves.toMatchObject({
            status: "ACCEPTED",
            externalId: "SM123",
        });
        expect(fixture.httpClient).toHaveBeenCalledWith(
            "https://twilio.test/2010-04-01/Accounts/ACtest/Messages.json",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({ Authorization: "Basic QUN0ZXN0OnRlc3QtdG9rZW4=" }),
                body: "To=%2B919876543210&From=%2B15005550006&Body=Margin+shortfall+requires+action.",
            }),
        );
    });

    it("parses Twilio rejection details without throwing away retry information", async () => {
        const { provider } = providerWith({
            ok: false,
            status: 429,
            payload: { code: 20429, message: "Too many requests" },
        });

        await expect(provider.send(sms)).resolves.toMatchObject({
            status: "FAILED",
            failureCode: "20429",
            failureReason: "Too many requests",
            retryable: true,
        });
    });

    it("maps a provider status lookup to the common delivery status", async () => {
        const { provider, httpClient } = providerWith({
            ok: true,
            status: 200,
            payload: { sid: "SM123", status: "delivered" },
        });

        await expect(provider.getStatus("SM123")).resolves.toBe("DELIVERED");
        expect(httpClient).toHaveBeenCalledWith(
            "https://twilio.test/2010-04-01/Accounts/ACtest/Messages/SM123.json",
            expect.objectContaining({ method: "GET" }),
        );
    });

    it("validates E.164 recipients and exposes Twilio's unbounded quota shape", async () => {
        const { provider } = providerWith({ ok: true, status: 200, payload: {} });

        await expect(provider.validateRecipient("9876543210"))
            .resolves.toMatchObject({ valid: false });
        await expect(provider.validateRecipient("+919876543210"))
            .resolves.toEqual({ valid: true, normalizedAddress: "+919876543210" });
        await expect(provider.getQuota()).resolves.toMatchObject({ limit: null, remaining: null });
    });

    it("reports Twilio API availability without sending an SMS", async () => {
        const { provider, httpClient } = providerWith({ ok: true, status: 200, payload: {} });

        await expect(provider.checkHealth()).resolves.toMatchObject({
            provider: "twilio", channel: "SMS", status: "HEALTHY",
        });
        expect(httpClient).toHaveBeenCalledWith(
            "https://twilio.test/2010-04-01/Accounts/ACtest.json",
            expect.objectContaining({ method: "GET" }),
        );
    });

    it("rejects invalid configuration, wrong channels, and missing environment values", async () => {
        expect(() => new TwilioSmsProvider({
            accountSid: "",
            authToken: "token",
            fromPhone: "+15005550006",
        })).toThrow(TwilioSmsProviderConfigurationError);
        const { provider } = providerWith({ ok: true, status: 200, payload: {} });
        await expect(provider.send({ ...sms, channel: "EMAIL" }))
            .rejects.toBeInstanceOf(TwilioSmsProviderConfigurationError);
        expect(() => createTwilioSmsProviderFromEnv({})).toThrow(TwilioSmsProviderConfigurationError);
    });
});
