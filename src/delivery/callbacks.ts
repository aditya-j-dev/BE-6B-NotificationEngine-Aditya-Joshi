import type { ProviderCallbackStatus } from "./acknowledgements";

export interface NormalizedProviderCallback {
    callbackId: string;
    externalId: string;
    status: ProviderCallbackStatus;
    occurredAt: Date;
    providerStatus: string;
    payload: Record<string, unknown>;
}

const CALLBACK_STATUS: Record<string, ProviderCallbackStatus> = {
    queued: "QUEUED",
    accepted: "QUEUED",
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
    undelivered: "FAILED",
    bounced: "BOUNCED",
};

function normalizeStatus(status: string): ProviderCallbackStatus {
    const normalized = CALLBACK_STATUS[status.toLowerCase()];
    if (!normalized) {
        throw new Error(`Unsupported provider delivery status: ${status}`);
    }

    return normalized;
}

/** Normalizes the delivery-status fields sent by Twilio status callbacks. */
export function normalizeTwilioCallback(payload: {
    MessageSid: string;
    MessageStatus: string;
    Timestamp?: string;
    EventSid?: string;
    [key: string]: unknown;
}): NormalizedProviderCallback {
    const occurredAt = payload.Timestamp ? new Date(payload.Timestamp) : new Date();
    if (Number.isNaN(occurredAt.valueOf())) {
        throw new Error("Twilio callback Timestamp must be a valid date");
    }

    return {
        callbackId: payload.EventSid ?? `${payload.MessageSid}:${payload.MessageStatus}:${occurredAt.toISOString()}`,
        externalId: payload.MessageSid,
        status: normalizeStatus(payload.MessageStatus),
        occurredAt,
        providerStatus: payload.MessageStatus,
        payload,
    };
}

/** Normalizes one Meta WhatsApp `statuses` callback item. */
export function normalizeWhatsAppCallback(payload: {
    id: string;
    status: string;
    timestamp: string;
    [key: string]: unknown;
}): NormalizedProviderCallback {
    const occurredAt = new Date(Number(payload.timestamp) * 1000);
    if (Number.isNaN(occurredAt.valueOf())) {
        throw new Error("WhatsApp callback timestamp must be a Unix timestamp in seconds");
    }

    return {
        callbackId: `${payload.id}:${payload.status}:${payload.timestamp}`,
        externalId: payload.id,
        status: normalizeStatus(payload.status),
        occurredAt,
        providerStatus: payload.status,
        payload,
    };
}
