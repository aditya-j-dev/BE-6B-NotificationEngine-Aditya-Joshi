import {
    applicationDefault,
    getApps,
    initializeApp,
} from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

import type {
    DeliveryProvider,
    DeliveryResult,
    DeliveryStatus,
    PreparedNotification,
    QuotaInfo,
    ValidationResult,
} from "./delivery-provider";
import type { HealthCheckableProvider, ProviderHealth } from "./provider-health";

export interface FcmMessage {
    token: string;
    notification: { title: string; body: string };
    data: Record<string, string>;
}

export interface FcmMessagingClient {
    send(message: FcmMessage): Promise<string>;
}

export interface FcmPushProviderConfig {
    projectId: string;
}

interface FirebaseError extends Error {
    code?: string;
}

export class FcmPushProviderConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FcmPushProviderConfigurationError";
    }
}

/** Firebase Cloud Messaging HTTP v1 provider, backed by Firebase Admin SDK. */
export class FcmPushProvider implements DeliveryProvider, HealthCheckableProvider {
    readonly provider = "fcm";
    readonly channel = "PUSH" as const;

    constructor(
        private readonly messaging: FcmMessagingClient,
        private readonly config: FcmPushProviderConfig,
    ) {
        if (!config.projectId.trim()) {
            throw new FcmPushProviderConfigurationError("Firebase project ID is required");
        }
    }

    async send(notification: PreparedNotification): Promise<DeliveryResult> {
        if (notification.channel !== "PUSH") {
            throw new FcmPushProviderConfigurationError(
                "FcmPushProvider can only send PUSH notifications",
            );
        }
        const recipient = await this.validateRecipient(notification.recipient);
        if (!recipient.valid) {
            return {
                status: "FAILED",
                failureCode: "INVALID_REGISTRATION_TOKEN",
                failureReason: recipient.reason ?? "Invalid FCM registration token",
                retryable: false,
            };
        }

        try {
            const externalId = await this.messaging.send({
                token: recipient.normalizedAddress ?? notification.recipient,
                notification: {
                    title: notification.title ?? notification.subject ?? "ZeTheta notification",
                    body: notification.content,
                },
                data: this.dataPayload(notification),
            });
            return {
                status: "SENT",
                externalId,
                acceptedAt: new Date().toISOString(),
                providerMetadata: { firebaseProjectId: this.config.projectId },
            };
        } catch (error) {
            const firebaseError = error as FirebaseError;
            return {
                status: "FAILED",
                failureCode: firebaseError.code ?? "FCM_SEND_FAILED",
                failureReason: firebaseError.message || "FCM send failed",
                retryable: this.isRetryable(firebaseError.code),
            };
        }
    }

    async getStatus(_externalId: string): Promise<DeliveryStatus> {
        void _externalId;
        // FCM does not expose a general server-side status lookup by message ID.
        return "UNKNOWN";
    }

    async validateRecipient(address: string): Promise<ValidationResult> {
        const normalizedAddress = address.trim();
        return /^[A-Za-z0-9_:-]{20,}$/.test(normalizedAddress)
            ? { valid: true, normalizedAddress }
            : { valid: false, reason: "FCM recipient must be a device registration token" };
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
        // FCM has no non-delivery health endpoint. This confirms the Admin client
        // was initialized successfully; send failures remain observable per message.
        return {
            provider: this.provider,
            channel: this.channel,
            status: "HEALTHY",
            checkedAt: new Date().toISOString(),
            responseTimeMs: 0,
            message: "Firebase Admin client initialized",
        };
    }

    private dataPayload(notification: PreparedNotification): Record<string, string> {
        const metadata = Object.entries(notification.metadata ?? {})
            .flatMap(([key, value]) => typeof value === "string"
                || typeof value === "number"
                || typeof value === "boolean"
                ? [[key, String(value)] as const]
                : []);
        return {
            notificationId: notification.notificationId,
            eventId: notification.eventId,
            eventType: notification.eventType,
            ...Object.fromEntries(metadata),
        };
    }

    private isRetryable(code: string | undefined): boolean {
        return [
            "messaging/internal-error",
            "messaging/server-unavailable",
            "messaging/unknown-error",
        ].includes(code ?? "");
    }
}

/** Builds the FCM provider from Application Default Credentials in the environment. */
export function createFcmPushProviderFromEnv(
    environment: NodeJS.ProcessEnv = process.env,
): FcmPushProvider {
    const projectId = environment.FIREBASE_PROJECT_ID;
    if (!projectId) {
        throw new FcmPushProviderConfigurationError("FIREBASE_PROJECT_ID is required");
    }
    if (!environment.GOOGLE_APPLICATION_CREDENTIALS) {
        throw new FcmPushProviderConfigurationError(
            "GOOGLE_APPLICATION_CREDENTIALS must point to the Firebase service-account JSON file",
        );
    }

    const app = getApps()[0] ?? initializeApp({
        credential: applicationDefault(),
        projectId,
    });
    return new FcmPushProvider(getMessaging(app), { projectId });
}
