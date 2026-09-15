import type { NotificationChannel } from "../generated/prisma/enums";
import type {
    DeliveryProvider,
    DeliveryResult,
    DeliveryStatus,
    PreparedNotification,
    QuotaInfo,
    ValidationResult,
} from "../providers";

export interface RedisRealtimeMetricsClient {
    hincrby(key: string, field: string, increment: number): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
}

export interface ChannelRealtimeMetrics {
    channel: NotificationChannel;
    deliveries: number;
    failures: number;
    latencyTotalMs: number;
    latencySamples: number;
    averageLatencyMs: number;
}

export interface DeliveryMetricRecorder {
    record(channel: NotificationChannel, result: DeliveryResult, latencyMs: number): Promise<void>;
}

/** Redis hash counters for the current real-time channel snapshot. */
export class RealtimeDeliveryMetricsService implements DeliveryMetricRecorder {
    constructor(private readonly redis: RedisRealtimeMetricsClient) { }

    async record(channel: NotificationChannel, result: DeliveryResult, latencyMs: number): Promise<void> {
        const key = this.key(channel);
        const boundedLatency = Math.max(0, Math.round(latencyMs));
        const increments: Array<[field: string, value: number]> = [
            [result.status === "FAILED" ? "failures" : "deliveries", 1],
            ["latencyTotalMs", boundedLatency],
            ["latencySamples", 1],
        ];
        await Promise.all(increments.map(([field, value]) => this.redis.hincrby(key, field, value)));
    }

    async snapshot(channel: NotificationChannel): Promise<ChannelRealtimeMetrics> {
        const values = await this.redis.hgetall(this.key(channel));
        const deliveries = this.number(values.deliveries);
        const failures = this.number(values.failures);
        const latencyTotalMs = this.number(values.latencyTotalMs);
        const latencySamples = this.number(values.latencySamples);
        return {
            channel,
            deliveries,
            failures,
            latencyTotalMs,
            latencySamples,
            averageLatencyMs: latencySamples === 0 ? 0 : latencyTotalMs / latencySamples,
        };
    }

    private key(channel: NotificationChannel): string {
        return `notification:analytics:realtime:channel:${channel}`;
    }

    private number(value: string | undefined): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }
}

/** Measures provider response latency and records one real-time metric per delivery attempt. */
export class MetricsDeliveryProvider implements DeliveryProvider {
    constructor(
        private readonly provider: DeliveryProvider,
        private readonly metrics: DeliveryMetricRecorder,
        private readonly now: () => number = Date.now,
    ) { }

    async send(notification: PreparedNotification): Promise<DeliveryResult> {
        const startedAt = this.now();
        try {
            const result = await this.provider.send(notification);
            await this.metrics.record(notification.channel, result, this.now() - startedAt);
            return result;
        } catch (error) {
            await this.metrics.record(notification.channel, {
                status: "FAILED",
                failureCode: "PROVIDER_UNEXPECTED_ERROR",
                failureReason: error instanceof Error ? error.message : "Provider threw an unknown error",
                retryable: true,
            }, this.now() - startedAt);
            throw error;
        }
    }

    getStatus(externalId: string): Promise<DeliveryStatus> {
        return this.provider.getStatus(externalId);
    }

    validateRecipient(address: string): Promise<ValidationResult> {
        return this.provider.validateRecipient(address);
    }

    getQuota(): Promise<QuotaInfo> {
        return this.provider.getQuota();
    }
}
