import { describe, expect, it } from "vitest";

import { EmailOperationsAlerter } from "..";
import type { DeliveryProvider } from "../../providers";

function provider(send: DeliveryProvider["send"]): DeliveryProvider {
    return {
        send,
        getStatus: async () => "UNKNOWN",
        validateRecipient: async () => ({ valid: true }),
        getQuota: async () => ({ provider: "smtp", channel: "EMAIL", limit: null, remaining: null, resetsAt: null }),
    };
}

const alert = {
    depth: 125,
    threshold: 100,
    severity: "WARNING" as const,
    observedAt: "2026-09-15T12:00:00.000Z",
};

describe("EmailOperationsAlerter", () => {
    it("sends a detailed DLQ operations email", async () => {
        let capturedSubject = "";
        const alerter = new EmailOperationsAlerter(provider(async (notification) => {
            capturedSubject = notification.subject ?? "";
            expect(notification).toMatchObject({
                channel: "EMAIL",
                recipient: "ops@example.com",
                eventType: "DLQ_DEPTH_ALERT",
            });
            return { status: "SENT", externalId: "email-1", acceptedAt: "now" };
        }), "ops@example.com");

        await expect(alerter.send(alert)).resolves.toBeUndefined();
        expect(capturedSubject).toContain("ZeTheta DLQ depth is 125");
    });

    it("surfaces an email-provider failure so alert suppression can be released", async () => {
        const alerter = new EmailOperationsAlerter(provider(async () => ({
            status: "FAILED", failureCode: "SMTP_DOWN", failureReason: "SMTP unavailable", retryable: true,
        })), "ops@example.com");

        await expect(alerter.send(alert)).rejects.toThrow("SMTP unavailable");
    });
});
