import type { NotificationChannel } from "../generated/prisma/enums";

import type { DeliveryProvider, DeliveryResult, PreparedNotification } from "./delivery-provider";

export type ProviderFallbackPlan = Readonly<Partial<Record<NotificationChannel, readonly string[]>>>;

/** Required provider order for the SMS and push channels in Part A §A3.3. */
export const DEFAULT_PROVIDER_FALLBACK_PLAN: ProviderFallbackPlan = {
    SMS: ["msg91", "twilio"],
    PUSH: ["fcm", "apns"],
};

export interface NamedDeliveryProvider extends DeliveryProvider {
    readonly provider: string;
}

export interface DeliveryProviderRegistry {
    get(provider: string): NamedDeliveryProvider | undefined;
}

export interface ProviderFailoverAttempt {
    provider: string;
    result: DeliveryResult;
}

export interface ProviderFailoverResult {
    delivered: boolean;
    selectedProvider?: string;
    attempts: ProviderFailoverAttempt[];
    failure?: DeliveryResult;
    idempotencyKey?: string;
    replayed?: boolean;
}

export interface ProviderFailoverIdempotencyStore {
    claim(key: string, ttlSeconds: number): Promise<boolean>;
    get(key: string): Promise<string | null>;
    complete(key: string, serializedResult: string, ttlSeconds: number): Promise<void>;
    release(key: string): Promise<void>;
}

export interface RedisProviderFailoverIdempotencyClient {
    set(
        key: string,
        value: string,
        mode: "EX",
        ttlSeconds: number,
        condition?: "NX",
    ): Promise<"OK" | null>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
}

/** Redis implementation with an atomic NX claim suitable for multi-worker delivery. */
export class RedisProviderFailoverIdempotencyStore implements ProviderFailoverIdempotencyStore {
    constructor(private readonly redis: RedisProviderFailoverIdempotencyClient) { }

    claim(key: string, ttlSeconds: number): Promise<boolean> {
        return this.redis.set(key, "IN_PROGRESS", "EX", ttlSeconds, "NX").then((result) => result === "OK");
    }

    get(key: string): Promise<string | null> {
        return this.redis.get(key);
    }

    async complete(key: string, serializedResult: string, ttlSeconds: number): Promise<void> {
        await this.redis.set(key, serializedResult, "EX", ttlSeconds);
    }

    async release(key: string): Promise<void> {
        await this.redis.del(key);
    }
}

function unavailable(provider: string): DeliveryResult {
    return {
        status: "FAILED",
        failureCode: "PROVIDER_UNAVAILABLE",
        failureReason: `Provider ${provider} is not configured or unavailable`,
        retryable: true,
    };
}

function unexpectedFailure(provider: string, error: unknown): DeliveryResult {
    return {
        status: "FAILED",
        failureCode: "PROVIDER_UNEXPECTED_ERROR",
        failureReason: `${provider}: ${error instanceof Error ? error.message : "Unknown provider error"}`,
        retryable: true,
    };
}

/**
 * Sends through one channel's ordered provider chain. A retryable provider
 * failure (including an open circuit) advances to the next provider; a
 * permanent delivery failure stops the chain to avoid duplicate invalid sends.
 */
export class ProviderFailoverService {
    constructor(
        private readonly providers: DeliveryProviderRegistry,
        private readonly fallbackPlan: ProviderFallbackPlan = DEFAULT_PROVIDER_FALLBACK_PLAN,
        private readonly idempotencyStore?: ProviderFailoverIdempotencyStore,
        private readonly idempotencyTtlSeconds = 86_400,
    ) { }

    async send(
        notification: PreparedNotification,
        idempotencyKey = this.idempotencyKeyFor(notification),
    ): Promise<ProviderFailoverResult> {
        if (!this.idempotencyStore) {
            return this.sendThroughProviders(notification);
        }

        const key = `notification:provider-failover:${idempotencyKey}`;
        const claimed = await this.idempotencyStore.claim(key, this.idempotencyTtlSeconds);
        if (!claimed) {
            const stored = await this.idempotencyStore.get(key);
            const replay = stored ? this.parseStoredResult(stored) : null;
            if (replay) {
                return { ...replay, idempotencyKey, replayed: true };
            }

            return {
                delivered: false,
                attempts: [],
                idempotencyKey,
                failure: {
                    status: "FAILED",
                    failureCode: "DELIVERY_IN_PROGRESS",
                    failureReason: "An identical provider failover is already in progress",
                    retryable: true,
                },
            };
        }

        try {
            const result = await this.sendThroughProviders(notification);
            const withKey = { ...result, idempotencyKey };
            const isRetryableFailure = result.failure?.status === "FAILED" && result.failure.retryable;
            if (result.delivered || !isRetryableFailure) {
                await this.idempotencyStore.complete(key, JSON.stringify(withKey), this.idempotencyTtlSeconds);
            } else {
                await this.idempotencyStore.release(key);
            }
            return withKey;
        } catch (error) {
            await this.idempotencyStore.release(key);
            throw error;
        }
    }

    private async sendThroughProviders(notification: PreparedNotification): Promise<ProviderFailoverResult> {
        const providerNames = this.fallbackPlan[notification.channel] ?? [];
        const attempts: ProviderFailoverAttempt[] = [];

        if (providerNames.length === 0) {
            return {
                delivered: false,
                attempts,
                failure: {
                    status: "FAILED",
                    failureCode: "NO_PROVIDER_FALLBACK_PLAN",
                    failureReason: `No provider fallback plan for ${notification.channel}`,
                    retryable: false,
                },
            };
        }

        for (const providerName of providerNames) {
            const provider = this.providers.get(providerName);
            const result = provider
                ? await this.sendSafely(providerName, provider, notification)
                : unavailable(providerName);
            attempts.push({ provider: providerName, result });

            if (result.status !== "FAILED") {
                return { delivered: true, selectedProvider: providerName, attempts };
            }

            if (!result.retryable) {
                return { delivered: false, attempts, failure: result };
            }
        }

        return { delivered: false, attempts, failure: attempts.at(-1)?.result };
    }

    private async sendSafely(
        providerName: string,
        provider: NamedDeliveryProvider,
        notification: PreparedNotification,
    ): Promise<DeliveryResult> {
        try {
            return await provider.send(notification);
        } catch (error) {
            return unexpectedFailure(providerName, error);
        }
    }

    private idempotencyKeyFor(notification: PreparedNotification): string {
        const metadataKey = notification.metadata?.idempotencyKey;
        return typeof metadataKey === "string" && metadataKey.trim()
            ? metadataKey
            : notification.notificationId;
    }

    private parseStoredResult(value: string): ProviderFailoverResult | null {
        if (value === "IN_PROGRESS") return null;

        try {
            const parsed: unknown = JSON.parse(value);
            if (
                typeof parsed === "object"
                && parsed !== null
                && "delivered" in parsed
                && typeof parsed.delivered === "boolean"
                && "attempts" in parsed
                && Array.isArray(parsed.attempts)
            ) {
                return parsed as ProviderFailoverResult;
            }
        } catch {
            // A malformed cache value must not be treated as a completed delivery.
        }

        return null;
    }
}
