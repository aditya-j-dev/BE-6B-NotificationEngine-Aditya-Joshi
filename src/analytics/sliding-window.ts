import type { NotificationChannel } from "../generated/prisma/enums";
import type { DeliveryResult } from "../providers";

export type AnalyticsWindow = "HOUR" | "DAY" | "WEEK";

export interface RedisSlidingWindowClient {
    hincrby(key: string, field: string, increment: number): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
    expire(key: string, seconds: number): Promise<number>;
    zadd(key: string, score: number, member: string): Promise<number>;
    zrangebyscore(key: string, minimum: number | string, maximum: number | string): Promise<string[]>;
    zremrangebyscore(key: string, minimum: number | string, maximum: number | string): Promise<number>;
}

export interface SlidingWindowMetrics {
    channel: NotificationChannel;
    window: AnalyticsWindow;
    from: string;
    to: string;
    deliveries: number;
    failures: number;
    latencyTotalMs: number;
    latencySamples: number;
    averageLatencyMs: number;
}

const WINDOW_MS: Record<AnalyticsWindow, number> = {
    HOUR: 60 * 60 * 1_000,
    DAY: 24 * 60 * 60 * 1_000,
    WEEK: 7 * 24 * 60 * 60 * 1_000,
};
const BUCKET_MS = 60 * 1_000;

/**
 * Redis minute-bucket time series. Small buckets preserve correct rolling
 * boundaries while the dashboard aggregates hour/day/week totals on demand.
 */
export class SlidingWindowAnalyticsService {
    constructor(
        private readonly redis: RedisSlidingWindowClient,
        private readonly retentionSeconds = 8 * 24 * 60 * 60,
    ) {
        if (!Number.isInteger(retentionSeconds) || retentionSeconds < 7 * 24 * 60 * 60) {
            throw new Error("Analytics retention must cover at least one week");
        }
    }

    async record(
        channel: NotificationChannel,
        result: DeliveryResult,
        latencyMs: number,
        occurredAt = new Date(),
    ): Promise<void> {
        const bucketStart = this.bucketStart(occurredAt);
        const bucketKey = this.bucketKey(channel, bucketStart);
        const latency = Math.max(0, Math.round(latencyMs));
        await Promise.all([
            this.redis.hincrby(bucketKey, result.status === "FAILED" ? "failures" : "deliveries", 1),
            this.redis.hincrby(bucketKey, "latencyTotalMs", latency),
            this.redis.hincrby(bucketKey, "latencySamples", 1),
            this.redis.zadd(this.indexKey(channel), bucketStart.getTime(), bucketKey),
            this.redis.expire(bucketKey, this.retentionSeconds),
            this.redis.zremrangebyscore(this.indexKey(channel), "-inf", occurredAt.getTime() - (this.retentionSeconds * 1_000)),
        ]);
    }

    async aggregate(
        channel: NotificationChannel,
        window: AnalyticsWindow,
        now = new Date(),
    ): Promise<SlidingWindowMetrics> {
        const from = new Date(now.getTime() - WINDOW_MS[window]);
        const bucketKeys = await this.redis.zrangebyscore(
            this.indexKey(channel),
            this.bucketStart(from).getTime(),
            this.bucketStart(now).getTime(),
        );
        const buckets = await Promise.all(bucketKeys.map((key) => this.redis.hgetall(key)));
        const totals = buckets.reduce((aggregate, bucket) => ({
            deliveries: aggregate.deliveries + this.number(bucket.deliveries),
            failures: aggregate.failures + this.number(bucket.failures),
            latencyTotalMs: aggregate.latencyTotalMs + this.number(bucket.latencyTotalMs),
            latencySamples: aggregate.latencySamples + this.number(bucket.latencySamples),
        }), { deliveries: 0, failures: 0, latencyTotalMs: 0, latencySamples: 0 });

        return {
            channel,
            window,
            from: from.toISOString(),
            to: now.toISOString(),
            ...totals,
            averageLatencyMs: totals.latencySamples === 0 ? 0 : totals.latencyTotalMs / totals.latencySamples,
        };
    }

    private bucketStart(timestamp: Date): Date {
        return new Date(Math.floor(timestamp.getTime() / BUCKET_MS) * BUCKET_MS);
    }

    private bucketKey(channel: NotificationChannel, bucketStart: Date): string {
        return `notification:analytics:window:bucket:${channel}:${bucketStart.toISOString()}`;
    }

    private indexKey(channel: NotificationChannel): string {
        return `notification:analytics:window:index:${channel}`;
    }

    private number(value: string | undefined): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }
}
