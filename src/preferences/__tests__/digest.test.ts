import { describe, expect, it } from "vitest";

import {
    DigestService,
    type RedisDigestClient,
} from "../index";

class MemoryRedis implements RedisDigestClient {
    readonly lists = new Map<string, string[]>();
    readonly sets = new Map<string, Set<string>>();
    readonly expirations = new Map<string, number>();

    async rpush(key: string, ...values: string[]): Promise<number> {
        const list = this.lists.get(key) ?? [];
        list.push(...values);
        this.lists.set(key, list);
        return list.length;
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        const list = this.lists.get(key) ?? [];
        return list.slice(start, stop === -1 ? undefined : stop + 1);
    }

    async del(...keys: string[]): Promise<number> {
        return keys.reduce((count, key) => {
            const deleted = this.lists.delete(key) || this.sets.delete(key);
            return count + (deleted ? 1 : 0);
        }, 0);
    }

    async expire(key: string, seconds: number): Promise<number> {
        this.expirations.set(key, seconds);
        return 1;
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        const set = this.sets.get(key) ?? new Set<string>();
        const initialSize = set.size;
        members.forEach((member) => set.add(member));
        this.sets.set(key, set);
        return set.size - initialSize;
    }

    async smembers(key: string): Promise<string[]> {
        return [...(this.sets.get(key) ?? [])];
    }
}

function request(overrides = {}) {
    return {
        userId: "user-1",
        digestMode: "hourly" as const,
        priority: "LOW" as const,
        item: {
            eventId: "event-1",
            eventType: "MKTX-001",
            occurredAt: "2026-09-13T09:10:00.000Z",
            summary: "RELIANCE crossed your price alert",
        },
        ...overrides,
    };
}

describe("DigestService", () => {
    it("delivers immediately when the user selected immediate mode", async () => {
        const service = new DigestService(new MemoryRedis());

        await expect(service.queue(request({ digestMode: "immediate" })))
            .resolves.toEqual({ action: "DELIVER_IMMEDIATELY" });
    });

    it("bypasses the digest for HIGH and CRITICAL events", async () => {
        const service = new DigestService(new MemoryRedis());

        await expect(service.queue(request({ priority: "HIGH" })))
            .resolves.toEqual({ action: "DELIVER_IMMEDIATELY" });
        await expect(service.queue(request({ priority: "CRITICAL" })))
            .resolves.toEqual({ action: "DELIVER_IMMEDIATELY" });
    });

    it("queues a low-priority event for the next hourly delivery window", async () => {
        const redis = new MemoryRedis();
        const service = new DigestService(redis, 3600);

        await expect(service.queue(
            request(),
            new Date("2026-09-13T09:10:00.000Z"),
        )).resolves.toEqual({
            action: "QUEUED_FOR_DIGEST",
            scheduledFor: "2026-09-13T10:00:00.000Z",
        });
        expect([...redis.expirations.values()]).toEqual([3600, 3600]);
    });

    it("schedules daily digests for the next UTC day", async () => {
        const service = new DigestService(new MemoryRedis());

        await expect(service.queue(
            request({ digestMode: "daily" }),
            new Date("2026-09-13T23:59:00.000Z"),
        )).resolves.toEqual({
            action: "QUEUED_FOR_DIGEST",
            scheduledFor: "2026-09-14T00:00:00.000Z",
        });
    });

    it("combines and orders a user's events into one digest", async () => {
        const redis = new MemoryRedis();
        const service = new DigestService(redis);
        const scheduledFor = new Date("2026-09-13T10:00:00.000Z");

        await service.queue(request({
            item: {
                eventId: "event-2",
                eventType: "MKTX-004",
                occurredAt: "2026-09-13T09:30:00.000Z",
                summary: "INFOSYS hit a 52-week high",
            },
        }), new Date("2026-09-13T09:30:00.000Z"));
        await service.queue(request(), new Date("2026-09-13T09:10:00.000Z"));

        await expect(service.drain("hourly", scheduledFor)).resolves.toEqual([{
            userId: "user-1",
            mode: "hourly",
            scheduledFor: "2026-09-13T10:00:00.000Z",
            items: [
                request().item,
                {
                    eventId: "event-2",
                    eventType: "MKTX-004",
                    occurredAt: "2026-09-13T09:30:00.000Z",
                    summary: "INFOSYS hit a 52-week high",
                },
            ],
        }]);
    });

    it("does not emit the same digest twice after it is drained", async () => {
        const service = new DigestService(new MemoryRedis());
        const scheduledFor = new Date("2026-09-13T10:00:00.000Z");

        await service.queue(request(), new Date("2026-09-13T09:10:00.000Z"));
        await service.drain("hourly", scheduledFor);

        await expect(service.drain("hourly", scheduledFor)).resolves.toEqual([]);
    });
});
