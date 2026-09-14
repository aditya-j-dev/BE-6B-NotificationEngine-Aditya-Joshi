import { describe, expect, it, vi } from "vitest";

import {
    NodemailerEmailProvider,
    NodemailerEmailProviderConfigurationError,
    type EmailTransport,
} from "../nodemailer-email-provider";

const email = {
    notificationId: "notification-1",
    eventId: "event-1",
    eventType: "TXNX-001",
    userId: "user-1",
    channel: "EMAIL" as const,
    recipient: "Investor@Example.com ",
    subject: "Order executed",
    content: "Your purchase order was executed.",
};

function providerWith(sendMail: EmailTransport["sendMail"]) {
    const transport = { sendMail } satisfies EmailTransport;
    return new NodemailerEmailProvider(transport, {
        from: "ZeTheta <no-reply@ethereal.email>",
        providerName: "ethereal",
        previewUrl: () => "https://ethereal.email/message/test-preview",
    });
}

describe("NodemailerEmailProvider", () => {
    it("sends a rendered email and returns its Ethereal preview URL", async () => {
        const sendMail = vi.fn().mockResolvedValue({
            messageId: "message-1",
            accepted: ["investor@example.com"],
            rejected: [],
        });
        const provider = providerWith(sendMail);

        await expect(provider.send(email)).resolves.toMatchObject({
            status: "SENT",
            externalId: "message-1",
            providerMetadata: { previewUrl: "https://ethereal.email/message/test-preview" },
        });
        expect(sendMail).toHaveBeenCalledWith({
            from: "ZeTheta <no-reply@ethereal.email>",
            to: "investor@example.com",
            subject: "Order executed",
            text: "Your purchase order was executed.",
        });
    });

    it("uses a safe default subject when a prepared email has none", async () => {
        const sendMail = vi.fn().mockResolvedValue({
            messageId: "message-1", accepted: ["investor@example.com"], rejected: [],
        });
        const provider = providerWith(sendMail);

        await provider.send({ ...email, subject: undefined });

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
            subject: "ZeTheta notification: TXNX-001",
        }));
    });

    it("returns non-retryable failures for invalid or rejected recipients", async () => {
        const provider = providerWith(vi.fn().mockResolvedValue({
            messageId: "message-1", accepted: [], rejected: ["investor@example.com"],
        }));

        await expect(provider.send({ ...email, recipient: "not-an-email" })).resolves.toMatchObject({
            status: "FAILED", failureCode: "INVALID_RECIPIENT", retryable: false,
        });
        await expect(provider.send(email)).resolves.toMatchObject({
            status: "FAILED", failureCode: "SMTP_RECIPIENT_REJECTED", retryable: false,
        });
    });

    it("converts SMTP transport failures into retryable delivery failures", async () => {
        const provider = providerWith(vi.fn().mockRejectedValue(new Error("SMTP unavailable")));

        await expect(provider.send(email)).resolves.toMatchObject({
            status: "FAILED", failureCode: "SMTP_SEND_FAILED", retryable: true,
        });
    });

    it("enforces the EMAIL channel and provides the shared status and quota operations", async () => {
        const provider = providerWith(vi.fn());

        await expect(provider.send({ ...email, channel: "SMS" }))
            .rejects.toBeInstanceOf(NodemailerEmailProviderConfigurationError);
        await expect(provider.getStatus("message-1")).resolves.toBe("UNKNOWN");
        await expect(provider.getQuota()).resolves.toEqual({
            provider: "ethereal", channel: "EMAIL", limit: null, remaining: null, resetsAt: null,
        });
    });

    it("reports SMTP transport health without sending an email", async () => {
        const transport = {
            sendMail: vi.fn(),
            verify: vi.fn().mockResolvedValue(true),
        } satisfies EmailTransport;
        const provider = new NodemailerEmailProvider(transport, {
            from: "no-reply@ethereal.email",
            providerName: "ethereal",
        });

        await expect(provider.checkHealth()).resolves.toMatchObject({
            provider: "ethereal", channel: "EMAIL", status: "HEALTHY",
        });
        expect(transport.verify).toHaveBeenCalledOnce();
    });

    it("rejects an invalid configured sender", () => {
        expect(() => providerWith(vi.fn())).not.toThrow();
        expect(() => new NodemailerEmailProvider({ sendMail: vi.fn() }, {
            from: "not-an-email",
        })).toThrow(NodemailerEmailProviderConfigurationError);
    });
});
