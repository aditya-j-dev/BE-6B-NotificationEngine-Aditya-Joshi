import nodemailer from "nodemailer";

import type {
    DeliveryProvider,
    DeliveryResult,
    DeliveryStatus,
    PreparedNotification,
    QuotaInfo,
    ValidationResult,
} from "./delivery-provider";
import type { HealthCheckableProvider, ProviderHealth } from "./provider-health";

export interface EmailTransportResult {
    messageId: string;
    accepted: string[];
    rejected: string[];
}

export interface EmailTransport {
    sendMail(message: {
        from: string;
        to: string;
        subject: string;
        text: string;
        html?: string;
    }): Promise<EmailTransportResult>;
    verify?(): Promise<true>;
}

export interface EtherealAccount {
    user: string;
    pass: string;
    smtp: {
        host: string;
        port: number;
        secure: boolean;
    };
}

export interface NodemailerEmailProviderOptions {
    from: string;
    providerName?: string;
    previewUrl?: (result: EmailTransportResult) => string | false;
}

export class NodemailerEmailProviderConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NodemailerEmailProviderConfigurationError";
    }
}

/** SMTP email adapter; Ethereal is used by the factory below for safe testing. */
export class NodemailerEmailProvider implements DeliveryProvider, HealthCheckableProvider {
    readonly channel = "EMAIL" as const;
    readonly provider: string;

    constructor(
        private readonly transport: EmailTransport,
        private readonly options: NodemailerEmailProviderOptions,
    ) {
        if (!this.isEmailAddress(options.from)) {
            throw new NodemailerEmailProviderConfigurationError(
                "Email provider sender must be a valid email address",
            );
        }
        this.provider = options.providerName ?? "nodemailer";
    }

    async send(notification: PreparedNotification): Promise<DeliveryResult> {
        if (notification.channel !== "EMAIL") {
            throw new NodemailerEmailProviderConfigurationError(
                "NodemailerEmailProvider can only send EMAIL notifications",
            );
        }
        const recipient = await this.validateRecipient(notification.recipient);
        if (!recipient.valid) {
            return {
                status: "FAILED",
                failureCode: "INVALID_RECIPIENT",
                failureReason: recipient.reason ?? "Invalid email recipient",
                retryable: false,
            };
        }

        try {
            const result = await this.transport.sendMail({
                from: this.options.from,
                to: recipient.normalizedAddress ?? notification.recipient,
                subject: notification.subject ?? `ZeTheta notification: ${notification.eventType}`,
                text: notification.content,
            });

            if (result.rejected.length > 0 || result.accepted.length === 0) {
                return {
                    status: "FAILED",
                    failureCode: "SMTP_RECIPIENT_REJECTED",
                    failureReason: `SMTP rejected: ${result.rejected.join(", ") || notification.recipient}`,
                    retryable: false,
                };
            }

            const previewUrl = this.options.previewUrl?.(result);
            return {
                status: "SENT",
                externalId: result.messageId,
                acceptedAt: new Date().toISOString(),
                ...(previewUrl ? { providerMetadata: { previewUrl } } : {}),
            };
        } catch (error) {
            return {
                status: "FAILED",
                failureCode: "SMTP_SEND_FAILED",
                failureReason: error instanceof Error ? error.message : "SMTP send failed",
                retryable: true,
            };
        }
    }

    async getStatus(_externalId: string): Promise<DeliveryStatus> {
        void _externalId;
        // SMTP/Ethereal has no provider callback or universal delivery-status API.
        return "UNKNOWN";
    }

    async validateRecipient(address: string): Promise<ValidationResult> {
        const normalizedAddress = address.trim().toLowerCase();
        return this.isEmailAddress(normalizedAddress)
            ? { valid: true, normalizedAddress }
            : { valid: false, reason: "Email recipient must be a valid email address" };
    }

    async getQuota(): Promise<QuotaInfo> {
        return {
            provider: this.provider,
            channel: "EMAIL",
            limit: null,
            remaining: null,
            resetsAt: null,
        };
    }

    async checkHealth(): Promise<ProviderHealth> {
        const startedAt = Date.now();
        if (!this.transport.verify) {
            return {
                provider: this.provider,
                channel: this.channel,
                status: "DEGRADED",
                checkedAt: new Date().toISOString(),
                responseTimeMs: Date.now() - startedAt,
                message: "SMTP transport does not support connection verification",
            };
        }

        try {
            await this.transport.verify();
            return {
                provider: this.provider,
                channel: this.channel,
                status: "HEALTHY",
                checkedAt: new Date().toISOString(),
                responseTimeMs: Date.now() - startedAt,
            };
        } catch (error) {
            return {
                provider: this.provider,
                channel: this.channel,
                status: "UNAVAILABLE",
                checkedAt: new Date().toISOString(),
                responseTimeMs: Date.now() - startedAt,
                message: error instanceof Error ? error.message : "SMTP health check failed",
            };
        }
    }

    private isEmailAddress(address: string): boolean {
        const candidate = address.match(/<([^>]+)>/)?.[1] ?? address;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate);
    }
}

/** Creates a safe Ethereal SMTP provider; messages are captured, never delivered. */
export async function createEtherealEmailProvider(): Promise<NodemailerEmailProvider> {
    const account = await nodemailer.createTestAccount();
    const transport = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
    }) as unknown as EmailTransport;

    return new NodemailerEmailProvider(transport, {
        from: `ZeTheta <${account.user}>`,
        providerName: "ethereal",
        previewUrl: (result) => nodemailer.getTestMessageUrl(
            result as unknown as { response?: string | Buffer | null },
        ),
    });
}
