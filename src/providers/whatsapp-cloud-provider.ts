import type {
    DeliveryProvider,
    DeliveryResult,
    DeliveryStatus,
    PreparedNotification,
    QuotaInfo,
    ValidationResult,
} from "./delivery-provider";
import type { HealthCheckableProvider, ProviderHealth } from "./provider-health";

export interface WhatsAppCloudProviderConfig {
    accessToken: string;
    phoneNumberId: string;
    apiVersion?: string;
    apiBaseUrl?: string;
}

export interface WhatsAppHttpResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}

export type WhatsAppHttpClient = (
    url: string,
    init: {
        method: "GET" | "POST";
        headers: Record<string, string>;
        body?: string;
    },
) => Promise<WhatsAppHttpResponse>;

interface WhatsAppResponse {
    messages?: Array<{ id?: string }>;
    error?: { code?: number; message?: string; error_subcode?: number };
}

export class WhatsAppCloudProviderConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WhatsAppCloudProviderConfigurationError";
    }
}

/** WhatsApp Cloud API adapter for test-mode text notifications. */
export class WhatsAppCloudProvider implements DeliveryProvider, HealthCheckableProvider {
    readonly provider = "whatsapp-cloud";
    readonly channel = "WHATSAPP" as const;
    private readonly apiVersion: string;
    private readonly apiBaseUrl: string;

    constructor(
        private readonly config: WhatsAppCloudProviderConfig,
        private readonly httpClient: WhatsAppHttpClient = async (url, init) => fetch(url, init),
    ) {
        if (!config.accessToken || !config.phoneNumberId) {
            throw new WhatsAppCloudProviderConfigurationError(
                "WhatsApp access token and phone number ID are required",
            );
        }
        this.apiVersion = config.apiVersion ?? "v25.0";
        this.apiBaseUrl = (config.apiBaseUrl ?? "https://graph.facebook.com").replace(/\/$/, "");
    }

    async send(notification: PreparedNotification): Promise<DeliveryResult> {
        if (notification.channel !== "WHATSAPP") {
            throw new WhatsAppCloudProviderConfigurationError(
                "WhatsAppCloudProvider can only send WHATSAPP notifications",
            );
        }
        const recipient = await this.validateRecipient(notification.recipient);
        if (!recipient.valid) {
            return {
                status: "FAILED",
                failureCode: "INVALID_RECIPIENT",
                failureReason: recipient.reason ?? "Invalid WhatsApp recipient",
                retryable: false,
            };
        }

        const response = await this.httpClient(this.messagesUrl(), {
            method: "POST",
            headers: this.headers({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: recipient.normalizedAddress,
                type: "text",
                text: { body: notification.content },
            }),
        });
        const payload = await this.readPayload(response);
        const externalId = payload.messages?.[0]?.id;

        if (!response.ok || !externalId) {
            return {
                status: "FAILED",
                failureCode: String(payload.error?.code ?? `HTTP_${response.status}`),
                failureReason: payload.error?.message ?? "WhatsApp Cloud API rejected the message",
                retryable: response.status >= 500 || response.status === 429,
                providerMetadata: payload.error?.error_subcode === undefined
                    ? undefined
                    : { metaSubcode: payload.error.error_subcode },
            };
        }

        return {
            status: "SENT",
            externalId,
            acceptedAt: new Date().toISOString(),
            providerMetadata: { apiVersion: this.apiVersion },
        };
    }

    async getStatus(_externalId: string): Promise<DeliveryStatus> {
        void _externalId;
        // Delivery receipts arrive through webhooks; Graph API has no generic lookup.
        return "UNKNOWN";
    }

    async validateRecipient(address: string): Promise<ValidationResult> {
        const normalizedAddress = address.replace(/[^\d]/g, "");
        return /^\d{8,15}$/.test(normalizedAddress)
            ? { valid: true, normalizedAddress }
            : { valid: false, reason: "WhatsApp recipient must be an E.164 phone number" };
    }

    async getQuota(): Promise<QuotaInfo> {
        return {
            provider: this.provider,
            channel: this.channel,
            limit: null,
            remaining: null,
            resetsAt: null,
        };
    }

    async checkHealth(): Promise<ProviderHealth> {
        const startedAt = Date.now();
        try {
            const response = await this.httpClient(`${this.phoneNumberUrl()}?fields=id`, {
                method: "GET",
                headers: this.headers(),
            });
            return {
                provider: this.provider,
                channel: this.channel,
                status: response.ok ? "HEALTHY" : "DEGRADED",
                checkedAt: new Date().toISOString(),
                responseTimeMs: Date.now() - startedAt,
                ...(response.ok ? {} : { message: `Meta Graph API returned HTTP ${response.status}` }),
            };
        } catch (error) {
            return {
                provider: this.provider,
                channel: this.channel,
                status: "UNAVAILABLE",
                checkedAt: new Date().toISOString(),
                responseTimeMs: Date.now() - startedAt,
                message: error instanceof Error ? error.message : "WhatsApp health check failed",
            };
        }
    }

    private messagesUrl(): string {
        return `${this.phoneNumberUrl()}/messages`;
    }

    private phoneNumberUrl(): string {
        return `${this.apiBaseUrl}/${this.apiVersion}/${encodeURIComponent(this.config.phoneNumberId)}`;
    }

    private headers(extra: Record<string, string> = {}): Record<string, string> {
        return { Authorization: `Bearer ${this.config.accessToken}`, ...extra };
    }

    private async readPayload(response: WhatsAppHttpResponse): Promise<WhatsAppResponse> {
        try {
            const payload = await response.json();
            return typeof payload === "object" && payload !== null
                ? payload as WhatsAppResponse
                : {};
        } catch {
            return {};
        }
    }
}

export function createWhatsAppCloudProviderFromEnv(
    environment: NodeJS.ProcessEnv = process.env,
): WhatsAppCloudProvider {
    return new WhatsAppCloudProvider({
        accessToken: environment.WHATSAPP_ACCESS_TOKEN ?? "",
        phoneNumberId: environment.WHATSAPP_PHONE_NUMBER_ID ?? "",
        ...(environment.WHATSAPP_GRAPH_API_VERSION
            ? { apiVersion: environment.WHATSAPP_GRAPH_API_VERSION }
            : {}),
    });
}
