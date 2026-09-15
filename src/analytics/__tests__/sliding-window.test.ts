import { describe, expect, it } from "vitest";

import {
    SlidingWindowAnalyticsService,
    type RedisSlidingWindowClient,
} from "..";

class MemorySlidingWindowRedis implements RedisSlidingWindowClient {
    private readonly hashes = new Map<string, Map<string, number>>();
    private readonly sortedSets = new Map<string, Map<string, number>>();

    async hincrby(key: string, field: string, increment: number): Promise<number> {
        const hash = this.hashes.get(key) ?? new Map<string, number>();
        const value = (hash.get(field) ?? 0) + increment;
        hash.set(field, value);
        this.hashes.set(key, hash);
        return value;
    }

    async hgetall(key: string): Promise<Record<string, string>> {
        return Object.fromEntries([...this.hashes.get(key)?.entries() ?? []].map(([field, value]) => [field, String(value)]));
    }

    async expire(): Promise<number> { return 1; }

    async zadd(key: string, score: number, member: string): Promise<number> {
        const sortedSet = this.sortedSets.get(key) ?? new Map<string, number>();
        sortedSet.set(member, score);
        this.sortedSets.set(key, sortedSet);
        return 1;
    }

    async zrangebyscore(key: string, minimum: number | string, maximum: number | string): Promise<string[]> {
        const min = minimum === "-inf" ? Number.NEGATIVE_INFINITY : Number(minimum);
        const max = maximum === "+inf" ? Number.POSITIVE_INFINITY : Number(maximum);
        return [...this.sortedSets.get(key)?.entries() ?? []]
            .filter(([, score]) => score >= min && score <= max)
            .sort((left, right) => left[1] - right[1])
            .map(([member]) => member);
    }

    async zremrangebyscore(key: string, minimum: number | string, maximum: number | string): Promise<number> {
        const members = await this.zrangebyscore(key, minimum, maximum);
        const sortedSet = this.sortedSets.get(key);
        members.forEach((member) => sortedSet?.delete(member));
        return members.length;
    }
}

describe("SlidingWindowAnalyticsService", () => {
    it("aggregates hourly buckets into rolling hour, day, and week windows", async () => {
        const analytics = new SlidingWindowAnalyticsService(new MemorySlidingWindowRedis());
        const now = new Date("2026-09-15T12:30:00.000Z");
        await analytics.record("SMS", { status: "SENT", externalId: "1", acceptedAt: "now" }, 100, new Date("2026-09-15T12:15:00.000Z"));
        await analytics.record("SMS", {
            status: "FAILED", failureCode: "DOWN", failureReason: "down", retryable: true,
        }, 300, new Date("2026-09-15T11:15:00.000Z"));
        await analytics.record("SMS", { status: "SENT", externalId: "2", acceptedAt: "now" }, 200, new Date("2026-09-12T12:15:00.000Z"));

        await expect(analytics.aggregate("SMS", "HOUR", now)).resolves.toMatchObject({
            deliveries: 1, failures: 0, averageLatencyMs: 100,
        });
        await expect(analytics.aggregate("SMS", "DAY", now)).resolves.toMatchObject({
            deliveries: 1, failures: 1, latencyTotalMs: 400, averageLatencyMs: 200,
        });
        await expect(analytics.aggregate("SMS", "WEEK", now)).resolves.toMatchObject({
            deliveries: 2, failures: 1, latencyTotalMs: 600, averageLatencyMs: 200,
        });
    });

    it("requires retention that can support the weekly window", () => {
        expect(() => new SlidingWindowAnalyticsService(new MemorySlidingWindowRedis(), 60)).toThrow("at least one week");
    });
});
