import { describe, expect, it } from "vitest";

import { RedisSortedSetRetryScheduler, type RedisRetrySchedulerClient } from "..";

class MemoryRedisRetryScheduler implements RedisRetrySchedulerClient {
    readonly hashes = new Map<string, Map<string, string>>();
    readonly sortedSets = new Map<string, Map<string, number>>();

    async hset(key: string, field: string, value: string): Promise<number> {
        const hash = this.hashes.get(key) ?? new Map<string, string>();
        const exists = hash.has(field);
        hash.set(field, value);
        this.hashes.set(key, hash);
        return exists ? 0 : 1;
    }

    async hget(key: string, field: string): Promise<string | null> {
        return this.hashes.get(key)?.get(field) ?? null;
    }

    async hdel(key: string, ...fields: string[]): Promise<number> {
        const hash = this.hashes.get(key);
        if (!hash) return 0;
        return fields.reduce((count, field) => count + (hash.delete(field) ? 1 : 0), 0);
    }

    async zadd(key: string, score: number, member: string): Promise<number> {
        const sortedSet = this.sortedSets.get(key) ?? new Map<string, number>();
        const exists = sortedSet.has(member);
        sortedSet.set(member, score);
        this.sortedSets.set(key, sortedSet);
        return exists ? 0 : 1;
    }

    async eval(_script: string, _numberOfKeys: number, ...arguments_: string[]): Promise<unknown> {
        const [key, dueAt, limit] = arguments_;
        const sortedSet = this.sortedSets.get(key ?? "") ?? new Map<string, number>();
        const jobs = [...sortedSet.entries()]
            .filter(([, score]) => score <= Number(dueAt))
            .sort((left, right) => left[1] - right[1])
            .slice(0, Number(limit))
            .map(([id]) => id);
        jobs.forEach((id) => sortedSet.delete(id));
        return jobs;
    }
}

describe("RedisSortedSetRetryScheduler", () => {
    it("schedules jobs with their due timestamp as the ZADD score and claims only due jobs", async () => {
        const redis = new MemoryRedisRetryScheduler();
        const scheduler = new RedisSortedSetRetryScheduler<{ notificationId: string }>(redis);
        await scheduler.schedule({ id: "late", payload: { notificationId: "n-2" }, attemptsMade: 1 }, new Date(2_000));
        await scheduler.schedule({ id: "early", payload: { notificationId: "n-1" }, attemptsMade: 2 }, new Date(1_000));

        await expect(scheduler.claimDue(10, new Date(1_500))).resolves.toEqual([
            { id: "early", payload: { notificationId: "n-1" }, attemptsMade: 2 },
        ]);
        await expect(scheduler.claimDue(10, new Date(1_500))).resolves.toEqual([]);
        await expect(scheduler.claimDue(10, new Date(2_000))).resolves.toEqual([
            { id: "late", payload: { notificationId: "n-2" }, attemptsMade: 1 },
        ]);
    });

    it("updates an existing job instead of duplicating it when a retry is rescheduled", async () => {
        const scheduler = new RedisSortedSetRetryScheduler<{ version: number }>(new MemoryRedisRetryScheduler());
        await scheduler.schedule({ id: "notification-1", payload: { version: 1 }, attemptsMade: 1 }, new Date(1_000));
        await scheduler.schedule({ id: "notification-1", payload: { version: 2 }, attemptsMade: 2 }, new Date(2_000));

        await expect(scheduler.claimDue(10, new Date(1_500))).resolves.toEqual([]);
        await expect(scheduler.claimDue(10, new Date(2_000))).resolves.toEqual([
            { id: "notification-1", payload: { version: 2 }, attemptsMade: 2 },
        ]);
    });

    it("rejects invalid claim limits before calling Redis", async () => {
        const scheduler = new RedisSortedSetRetryScheduler(new MemoryRedisRetryScheduler());
        await expect(scheduler.claimDue(0)).rejects.toThrow("positive integer");
    });
});
