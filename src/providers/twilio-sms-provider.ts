import type {
    DeliveryProvider,
    DeliveryResult,
    DeliveryStatus,
    PreparedNotification,
    QuotaInfo,
    ValidationResult,
} from "./delivery-provider";
import type { HealthCheckableProvider, ProviderHealth } from "./provider-health";

export interface TwilioSmsProviderConfig {
    accountSid: string;
    authToken: string;
    fromPhone: string;
    apiBaseUrl?: string;
}

export interface TwilioHttpResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}

export type TwilioHttpClient = (
    url: string,
    init: {
        method: "GET" | "POST";
        headers: Record<string, string>;
        body?: string;
    },
) => Promise<TwilioHttpResponse>;

interface TwilioMessageResponse {
    sid?: string;
    status?: string;
    code?: number | null;
    message?: string | null;
    error_code?: number | null;
    error_message?: string | null;
    date_created?: string;
}

export class TwilioSmsProviderConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TwilioSmsProviderConfigurationError";
    }
}

/**
 * Twilio REST provider compatible with Twilio test credentials and magic
 * numbers. It deliberately uses the platform HTTP client rather than an SDK.
 */
export class TwilioSmsProvider implements DeliveryProvider, HealthCheckableProvider {
    readonly provider = "twilio";
    readonly channel = "SMS" as const;
    private readonly apiBaseUrl: string;

    constructor(
        private readonly config: TwilioSmsProviderConfig,
        private readonly httpClient: TwilioHttpClient = async (url, init) => fetch(url, init),
    ) {
        this.assertConfiguration(config);
        this.apiBaseUrl = (config.apiBaseUrl ?? "https://api.twilio.com").replace(/\/$/, "");
    }

    async send(notification: PreparedNotification): Promise<DeliveryResult> {
        if (notification.channel !== "SMS") {
            throw new TwilioSmsProviderConfigurationError(
                "TwilioSmsProvider can only send SMS notifications",
            );
        }

        const response = await this.httpClient(
            this.messagesCollectionUrl(),
            {
                method: "POST",
                headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
                body: new URLSearchParams({
                    To: notification.recipient,
                    From: this.config.fromPhone,
                    Body: notification.content,
                }).toString(),
            },
        );
        const payload = await this.readPayload(response);

        if (!response.ok || !payload.sid) {
            return this.failureResult(payload, response.status);
        }

        return {
            status: this.isSentStatus(payload.status) ? "SENT" : "ACCEPTED",
            externalId: payload.sid,
            acceptedAt: payload.date_created ?? new Date().toISOString(),
            providerMetadata: { twilioStatus: payload.status ?? "queued" },
        };
    }

    async getStatus(externalId: string): Promise<DeliveryStatus> {
        const response = await this.httpClient(this.messageStatusUrl(externalId), {
            method: "GET",
            headers: this.headers(),
        });
        const payload = await this.readPayload(response);

        if (!response.ok) return "UNKNOWN";
        return this.toDeliveryStatus(payload.status);
    }

    async validateRecipient(address: string): Promise<ValidationResult> {
        if (!/^\+[1-9]\d{7,14}$/.test(address)) {
            return { valid: false, reason: "SMS recipient must be an E.164 phone number" };
        }

        return { valid: true, normalizedAddress: address };
    }

    async getQuota(): Promise<QuotaInfo> {
        // Twilio does not expose a single account-wide SMS quota through this API.
        return {
            provider: "twilio",
            channel: "SMS",
            limit: null,
            remaining: null,
            resetsAt: null,
        };
    }

    async checkHealth(): Promise<ProviderHealth> {
        const startedAt = Date.now();
        try {
            const response = await this.httpClient(this.accountUrl(), {
                method: "GET",
                headers: this.headers(),
            });
            return {
                provider: this.provider,
                channel: this.channel,
                status: response.ok ? "HEALTHY" : "DEGRADED",
                checkedAt: new Date().toISOString(),
                responseTimeMs: Date.now() - startedAt,
                ...(response.ok ? {} : { message: `Twilio API returned HTTP ${response.status}` }),
            };
        } catch (error) {
            return {
                provider: this.provider,
                channel: this.channel,
                status: "UNAVAILABLE",
                checkedAt: new Date().toISOString(),
                responseTimeMs: Date.now() - startedAt,
                message: error instanceof Error ? error.message : "Twilio health check failed",
            };
        }
    }

    private messagesCollectionUrl(): string {
        return `${this.apiBaseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`;
    }

    private accountUrl(): string {
        return `${this.apiBaseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}.json`;
    }

    private messageStatusUrl(externalId: string): string {
        return `${this.apiBaseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages/${encodeURIComponent(externalId)}.json`;
    }

    private headers(extra: Record<string, string> = {}): Record<string, string> {
        const encodedCredentials = Buffer
            .from(`${this.config.accountSid}:${this.config.authToken}`)
            .toString("base64");
        return { Authorization: `Basic ${encodedCredentials}`, ...extra };
    }

    private async readPayload(response: TwilioHttpResponse): Promise<TwilioMessageResponse> {
        try {
            const payload = await response.json();
            return typeof payload === "object" && payload !== null
                ? payload as TwilioMessageResponse
                : {};
        } catch {
            return {};
        }
    }

    private failureResult(payload: TwilioMessageResponse, httpStatus: number): DeliveryResult {
        return {
            status: "FAILED",
            failureCode: String(payload.error_code ?? payload.code ?? `HTTP_${httpStatus}`),
            failureReason: payload.error_message ?? payload.message ?? "Twilio rejected the SMS request",
            retryable: httpStatus >= 500 || httpStatus === 429,
            providerMetadata: { twilioStatus: payload.status ?? "failed", httpStatus },
        };
    }

    private isSentStatus(status: string | undefined): boolean {
        return status === "sent" || status === "delivered";
    }

    private toDeliveryStatus(status: string | undefined): DeliveryStatus {
        const mapped: Record<string, DeliveryStatus> = {
            queued: "QUEUED",
            accepted: "QUEUED",
            scheduled: "QUEUED",
            sending: "QUEUED",
            sent: "SENT",
            delivered: "DELIVERED",
            read: "READ",
            failed: "FAILED",
            undelivered: "FAILED",
            canceled: "FAILED",
        };
        return status ? (mapped[status] ?? "UNKNOWN") : "UNKNOWN";
    }

    private assertConfiguration(config: TwilioSmsProviderConfig): void {
        if (!config.accountSid || !config.authToken || !config.fromPhone) {
            throw new TwilioSmsProviderConfigurationError(
                "Twilio account SID, auth token, and sender phone are required",
            );
        }

        if (!/^\+[1-9]\d{7,14}$/.test(config.fromPhone)) {
            throw new TwilioSmsProviderConfigurationError(
                "Twilio sender phone must use E.164 format",
            );
        }
    }
}

export function createTwilioSmsProviderFromEnv(
    environment: NodeJS.ProcessEnv = process.env,
): TwilioSmsProvider {
    return new TwilioSmsProvider({
        accountSid: environment.TWILIO_ACCOUNT_SID ?? "",
        authToken: environment.TWILIO_AUTH_TOKEN ?? "",
        fromPhone: environment.TWILIO_FROM_PHONE ?? "",
    });
}
