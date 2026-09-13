import { describe, expect, it } from "vitest";
import type { QuietHoursDecision } from "../quiet-hours";
import {
    QuietHoursQueueError,
    QuietHoursQueueService,
    type RedisQuietHoursClient,
} from "../quiet-hours-queue";

class MemoryRedis implements RedisQuietHoursClient {
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
        let deleted = 0;
        for (const key of keys) {
            if (this.lists.delete(key) || this.sets.delete(key)) deleted += 1;
        }
        return deleted;
    }

    async expire(key: string, seconds: number): Promise<number> {
        this.expirations.set(key, seconds);
        return 1;
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        const set = this.sets.get(key) ?? new Set<string>();
        const sizeBefore = set.size;
        members.forEach((member) => set.add(member));
        this.sets.set(key, set);
        return set.size - sizeBefore;
    }

    async smembers(key: string): Promise<string[]> {
        return [...(this.sets.get(key) ?? new Set<string>())];
    }
}

const deferredDecision: QuietHoursDecision = {
    status: "DEFER_UNTIL_QUIET_HOURS_END",
    timezone: "Asia/Kolkata",
    localTime: "23:00",
    resumeAt: "2026-09-14T01:30:00.000Z",
    reason: "QUIET_HOURS",
};

function item(notificationId: string, deferredAt = "2026-09-13T17:30:00.000Z") {
    return {
        notificationId,
        eventId: `event-${notificationId}`,
        eventType: "BILL_PAYMENT_DUE",
        content: `Reminder ${notificationId}`,
        deferredAt,
    };
}

describe("QuietHoursQueueService", () => {
    it("queues a deferred item for the user's next local morning", async () => {
        const redis = new MemoryRedis();
        const service = new QuietHoursQueueService(redis);

        const result = await service.enqueue({
            userId: "user-1",
            timezone: "Asia/Kolkata",
            item: item("notification-1"),
        }, deferredDecision);

        expect(result.scheduledFor).toBe("2026-09-14T02:30:00.000Z");
        expect([...redis.expirations.values()]).toEqual([172800, 172800]);
    });

    it("accepts only decisions that were deferred for quiet hours", async () => {
        const service = new QuietHoursQueueService(new MemoryRedis());

        await expect(service.enqueue({
            userId: "user-1",
            timezone: "Asia/Kolkata",
            item: item("notification-1"),
        }, { ...deferredDecision, status: "DELIVER_NOW", reason: "OUTSIDE_QUIET_HOURS" }))
            .rejects.toBeInstanceOf(QuietHoursQueueError);
    });

    it("combines each user's queued items into one chronologically ordered digest", async () => {
        const redis = new MemoryRedis();
        const service = new QuietHoursQueueService(redis);

        await service.enqueue({ userId: "user-1", timezone: "Asia/Kolkata", item: item("later", "2026-09-13T18:00:00.000Z") }, deferredDecision);
        await service.enqueue({ userId: "user-1", timezone: "Asia/Kolkata", item: item("earlier", "2026-09-13T17:30:00.000Z") }, deferredDecision);

        const scheduledFor = new Date("2026-09-14T02:30:00.000Z");
        const digests = await service.drain(scheduledFor, { "user-1": "Asia/Kolkata" });

        expect(digests).toEqual([expect.objectContaining({
            userId: "user-1",
            timezone: "Asia/Kolkata",
            scheduledFor: scheduledFor.toISOString(),
            items: [item("earlier", "2026-09-13T17:30:00.000Z"), item("later", "2026-09-13T18:00:00.000Z")],
        })]);
        expect(await service.drain(scheduledFor, { "user-1": "Asia/Kolkata" })).toEqual([]);
    });

    it("keeps different users in separate morning digests", async () => {
        const service = new QuietHoursQueueService(new MemoryRedis());
        await service.enqueue({ userId: "user-1", timezone: "Asia/Kolkata", item: item("one") }, deferredDecision);
        await service.enqueue({ userId: "user-2", timezone: "Asia/Kolkata", item: item("two") }, deferredDecision);

        const digests = await service.drain(new Date("2026-09-14T02:30:00.000Z"), {
            "user-1": "Asia/Kolkata",
            "user-2": "Asia/Kolkata",
        });

        expect(digests).toHaveLength(2);
        expect(digests.map(({ userId, items }) => [userId, items[0]?.notificationId]))
            .toEqual(expect.arrayContaining([["user-1", "one"], ["user-2", "two"]]));
    });

    it("does not discard a queue when the user's timezone is temporarily unavailable", async () => {
        const service = new QuietHoursQueueService(new MemoryRedis());
        await service.enqueue({ userId: "user-1", timezone: "Asia/Kolkata", item: item("notification-1") }, deferredDecision);
        const scheduledFor = new Date("2026-09-14T02:30:00.000Z");

        await expect(service.drain(scheduledFor, {})).resolves.toEqual([]);
        await expect(service.drain(scheduledFor, { "user-1": "Asia/Kolkata" }))
            .resolves.toEqual([expect.objectContaining({ userId: "user-1" })]);
    });

    it("uses a configurable local-morning delivery time", async () => {
        const service = new QuietHoursQueueService(new MemoryRedis(), "09:30");
        const result = await service.enqueue({ userId: "user-1", timezone: "Asia/Kolkata", item: item("notification-1") }, deferredDecision);

        expect(result.scheduledFor).toBe("2026-09-14T04:00:00.000Z");
    });
});
