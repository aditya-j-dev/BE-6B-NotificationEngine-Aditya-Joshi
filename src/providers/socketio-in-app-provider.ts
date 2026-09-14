import type { Server } from "socket.io";

import type {
    DeliveryProvider,
    DeliveryResult,
    DeliveryStatus,
    PreparedNotification,
    QuotaInfo,
    ValidationResult,
} from "./delivery-provider";
import type { HealthCheckableProvider, ProviderHealth } from "./provider-health";

export interface InAppNotificationPayload {
    notificationId: string;
    eventId: string;
    eventType: string;
    title: string;
    content: string;
    metadata: Record<string, unknown>;
}

export interface InAppSocketServer {
    to(room: string): {
        emit(event: "notification", payload: InAppNotificationPayload): boolean;
    };
}

export class SocketIoInAppProviderConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SocketIoInAppProviderConfigurationError";
    }
}

/** Delivers in-app notifications to an authenticated user's Socket.io room. */
export class SocketIoInAppProvider implements DeliveryProvider, HealthCheckableProvider {
    readonly provider = "socket.io";
    readonly channel = "IN_APP" as const;

    constructor(private readonly io: InAppSocketServer) { }

    async send(notification: PreparedNotification): Promise<DeliveryResult> {
        if (notification.channel !== "IN_APP") {
            throw new SocketIoInAppProviderConfigurationError(
                "SocketIoInAppProvider can only send IN_APP notifications",
            );
        }
        const recipient = await this.validateRecipient(notification.recipient);
        if (!recipient.valid) {
            return {
                status: "FAILED",
                failureCode: "INVALID_RECIPIENT",
                failureReason: recipient.reason ?? "Invalid in-app recipient",
                retryable: false,
            };
        }
        if (recipient.normalizedAddress !== notification.userId) {
            return {
                status: "FAILED",
                failureCode: "RECIPIENT_USER_MISMATCH",
                failureReason: "In-app recipient must match the notification user ID",
                retryable: false,
            };
        }

        try {
            this.io.to(this.roomName(notification.userId)).emit("notification", {
                notificationId: notification.notificationId,
                eventId: notification.eventId,
                eventType: notification.eventType,
                title: notification.title ?? notification.subject ?? "ZeTheta notification",
                content: notification.content,
                metadata: notification.metadata ?? {},
            });
            return {
                status: "SENT",
                externalId: `socketio:${notification.notificationId}`,
                acceptedAt: new Date().toISOString(),
            };
        } catch (error) {
            return {
                status: "FAILED",
                failureCode: "SOCKETIO_EMIT_FAILED",
                failureReason: error instanceof Error ? error.message : "Socket.io emit failed",
                retryable: true,
            };
        }
    }

    async getStatus(_externalId: string): Promise<DeliveryStatus> {
        void _externalId;
        // The client receipt handler will provide delivery/read status in a later stage.
        return "UNKNOWN";
    }

    async validateRecipient(address: string): Promise<ValidationResult> {
        const normalizedAddress = address.trim();
        return normalizedAddress.length > 0
            ? { valid: true, normalizedAddress }
            : { valid: false, reason: "In-app recipient must be a user ID" };
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
        return {
            provider: this.provider,
            channel: this.channel,
            status: "HEALTHY",
            checkedAt: new Date().toISOString(),
            responseTimeMs: 0,
            message: "Socket.io server is initialized",
        };
    }

    private roomName(userId: string): string {
        return `user:${userId}`;
    }
}

/** Binds the provider to a real Socket.io Server instance. */
export function createSocketIoInAppProvider(io: Server): SocketIoInAppProvider {
    return new SocketIoInAppProvider(io);
}
