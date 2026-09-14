import type { NotificationChannel } from "../generated/prisma/enums";

/** A fully rendered notification, ready for a channel provider to deliver. */
export interface PreparedNotification {
    notificationId: string;
    eventId: string;
    eventType: string;
    userId: string;
    channel: NotificationChannel;
    recipient: string;
    content: string;
    subject?: string;
    title?: string;
    metadata?: Record<string, unknown>;
}

export type DeliveryResult =
    | {
        status: "ACCEPTED" | "SENT";
        externalId: string;
        acceptedAt: string;
        providerMetadata?: Record<string, unknown>;
    }
    | {
        status: "FAILED";
        failureCode: string;
        failureReason: string;
        retryable: boolean;
        providerMetadata?: Record<string, unknown>;
    };

export type DeliveryStatus =
    | "QUEUED"
    | "SENT"
    | "DELIVERED"
    | "READ"
    | "FAILED"
    | "UNKNOWN";

export interface ValidationResult {
    valid: boolean;
    normalizedAddress?: string;
    reason?: string;
}

export interface QuotaInfo {
    provider: string;
    channel: NotificationChannel;
    limit: number | null;
    remaining: number | null;
    resetsAt: string | null;
}

/**
 * The Part A §A3.3 contract implemented by every external or internal delivery
 * channel. Authentication, throttling, response parsing, failover, and circuit
 * breaking remain provider implementation responsibilities.
 */
export interface DeliveryProvider {
    send(notification: PreparedNotification): Promise<DeliveryResult>;
    getStatus(externalId: string): Promise<DeliveryStatus>;
    validateRecipient(address: string): Promise<ValidationResult>;
    getQuota(): Promise<QuotaInfo>;
}
