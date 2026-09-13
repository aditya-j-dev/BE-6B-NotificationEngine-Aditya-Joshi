import { describe, expect, it } from "vitest";

import {
    FrequencyCapService,
    type FrequencyCapPolicy,
    type RedisAtomicClient,
} from "../index";

class MemoryAtomicRedis implements RedisAtomicClient {
    readonly counts = new Map<string, number>();
    readonly calls: Array<{ keys: string[]; args: Array<string | number> }> = [];

    async eval(
        _script: string,
        numberOfKeys: number,
        ...args: Array<string | number>
    ): Promise<unknown> {
        const keys = args.slice(0, numberOfKeys).map(String);
        const values = args.slice(numberOfKeys);
        this.calls.push({ keys, args: values });

        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            const limit = Number(values[index * 2]);
            const current = this.counts.get(key) ?? 0;

            if (current >= limit) {
                return [0, index + 1, current, limit];
            }
        }

        keys.forEach((key) => this.counts.set(key, (this.counts.get(key) ?? 0) + 1));
        return [1];
    }
}

const request = {
    userId: "user-1",
    eventType: "MKTX-001",
    channel: "PUSH" as const,
};
const now = new Date("2026-09-13T09:15:00.000Z");

function policy(overrides: Partial<FrequencyCapPolicy> = {}): FrequencyCapPolicy {
    return {
        maxPerUserPerHour: 10,
        maxPerUserEventPerDay: 5,
        maxPerUserChannelPerDay: 20,
        ...overrides,
    };
}

describe("FrequencyCapService", () => {
    it("allows a notification under all three limits in one atomic operation", async () => {
        const redis = new MemoryAtomicRedis();
        const service = new FrequencyCapService(redis);

        await expect(service.checkAndIncrement(request, now))
            .resolves.toEqual({ allowed: true });
        expect(redis.calls[0]?.keys).toHaveLength(3);
        expect([...redis.counts.values()]).toEqual([1, 1, 1]);
    });

    it("blocks a user who exceeds the hourly limit without partial increments", async () => {
        const redis = new MemoryAtomicRedis();
        const service = new FrequencyCapService(redis, policy({ maxPerUserPerHour: 1 }));

        await service.checkAndIncrement(request, now);
        await expect(service.checkAndIncrement(request, now)).resolves.toEqual({
            allowed: false,
            blockedDimension: "USER_HOURLY",
            current: 1,
            limit: 1,
        });
        expect([...redis.counts.values()]).toEqual([1, 1, 1]);
    });

    it("caps repeated notifications for the same user and event each day", async () => {
        const redis = new MemoryAtomicRedis();
        const service = new FrequencyCapService(redis, policy({ maxPerUserEventPerDay: 1 }));

        await service.checkAndIncrement(request, now);
        await expect(service.checkAndIncrement({
            ...request,
            channel: "EMAIL",
        }, now)).resolves.toMatchObject({
            allowed: false,
            blockedDimension: "USER_EVENT_DAILY",
        });
    });

    it("caps repeated notifications on the same channel each day", async () => {
        const redis = new MemoryAtomicRedis();
        const service = new FrequencyCapService(redis, policy({ maxPerUserChannelPerDay: 1 }));

        await service.checkAndIncrement(request, now);
        await expect(service.checkAndIncrement({
            ...request,
            eventType: "MKTX-004",
        }, now)).resolves.toMatchObject({
            allowed: false,
            blockedDimension: "USER_CHANNEL_DAILY",
        });
    });

    it("starts a new hourly user cap window at the next UTC hour", async () => {
        const redis = new MemoryAtomicRedis();
        const service = new FrequencyCapService(redis, policy({ maxPerUserPerHour: 1 }));

        await service.checkAndIncrement(request, now);
        await expect(service.checkAndIncrement(
            { ...request, eventType: "MKTX-004", channel: "EMAIL" },
            new Date("2026-09-13T10:00:00.000Z"),
        )).resolves.toEqual({ allowed: true });
    });

    it("keeps each user's cap counters independent", async () => {
        const redis = new MemoryAtomicRedis();
        const service = new FrequencyCapService(redis, policy({ maxPerUserPerHour: 1 }));

        await service.checkAndIncrement(request, now);
        await expect(service.checkAndIncrement({ ...request, userId: "user-2" }, now))
            .resolves.toEqual({ allowed: true });
    });

    it("starts new event and channel cap windows at the next UTC day", async () => {
        const redis = new MemoryAtomicRedis();
        const service = new FrequencyCapService(redis, policy({
            maxPerUserEventPerDay: 1,
            maxPerUserChannelPerDay: 1,
        }));

        await service.checkAndIncrement(request, now);
        await expect(service.checkAndIncrement(
            request,
            new Date("2026-09-14T00:00:00.000Z"),
        )).resolves.toEqual({ allowed: true });
    });

    it("fails closed when Redis returns an invalid atomic response", async () => {
        const redis: RedisAtomicClient = {
            eval: async () => [],
        };
        const service = new FrequencyCapService(redis);

        await expect(service.checkAndIncrement(request, now))
            .rejects.toThrow("Unexpected Redis frequency-cap response");
    });

    it("fails closed when Redis names an unknown cap dimension", async () => {
        const redis: RedisAtomicClient = {
            eval: async () => [0, 99, 1, 1],
        };
        const service = new FrequencyCapService(redis);

        await expect(service.checkAndIncrement(request, now))
            .rejects.toThrow("unknown dimension");
    });
});
