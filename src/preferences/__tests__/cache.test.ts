import { describe, expect, it } from "vitest";

import {
    PreferenceService,
    RedisPreferenceCache,
    type PreferenceCache,
    type PreferenceInput,
    type PreferenceStore,
    type UserPreferenceRecord,
} from "../index";

const storedPreference: UserPreferenceRecord = {
    userId: "user-1",
    eventCategory: "transaction",
    eventType: "TXNX-001",
    channel: "EMAIL",
    enabled: true,
    quietHoursOverride: false,
    digestMode: "immediate",
    priorityOverride: null,
};

function createStore(calls: { users: number; reads: number; updates: number }): PreferenceStore {
    const transaction = {
        user: {
            findUnique: async () => {
                calls.users += 1;
                return { id: "user-1" };
            },
        },
        userPreference: {
            findMany: async () => {
                calls.reads += 1;
                return [storedPreference];
            },
            findUnique: async () => storedPreference,
            createMany: async () => ({ count: 0 }),
            upsert: async ({ create }: { create: UserPreferenceRecord }) => {
                calls.updates += 1;
                return create;
            },
        },
    };

    return {
        ...transaction,
        $transaction: async <T>(operation: (value: typeof transaction) => Promise<T>) =>
            operation(transaction),
    } as PreferenceStore;
}

class MemoryCache implements PreferenceCache {
    values = new Map<string, UserPreferenceRecord[]>();
    invalidated: string[] = [];
    fail = false;

    async get(userId: string): Promise<UserPreferenceRecord[] | null> {
        if (this.fail) {
            throw new Error("Redis is unavailable");
        }

        return this.values.get(userId) ?? null;
    }

    async set(userId: string, preferences: UserPreferenceRecord[]): Promise<void> {
        if (this.fail) {
            throw new Error("Redis is unavailable");
        }

        this.values.set(userId, preferences);
    }

    async invalidate(userId: string): Promise<void> {
        if (this.fail) {
            throw new Error("Redis is unavailable");
        }

        this.invalidated.push(userId);
        this.values.delete(userId);
    }
}

describe("RedisPreferenceCache", () => {
    it("serializes preferences using a namespaced key and TTL", async () => {
        const calls: unknown[][] = [];
        const redis = {
            get: async () => null,
            set: async (...args: unknown[]) => {
                calls.push(args);
                return "OK";
            },
            del: async () => 1,
        };
        const cache = new RedisPreferenceCache(redis, 120);

        await cache.set("user-1", [storedPreference]);

        expect(calls).toEqual([[
            "notification:preferences:user-1",
            JSON.stringify([storedPreference]),
            "EX",
            120,
        ]]);
    });

    it("returns cached records and removes corrupt cached data", async () => {
        const deleted: string[] = [];
        const redis = {
            get: async (key: string) => key.endsWith("valid")
                ? JSON.stringify([storedPreference])
                : "not-json",
            set: async () => "OK",
            del: async (key: string) => {
                deleted.push(key);
                return 1;
            },
        };
        const cache = new RedisPreferenceCache(redis);

        await expect(cache.get("valid")).resolves.toEqual([storedPreference]);
        await expect(cache.get("corrupt")).resolves.toBeNull();
        expect(deleted).toEqual(["notification:preferences:corrupt"]);
    });
});

describe("PreferenceService cache behavior", () => {
    it("returns a cache hit without querying the database", async () => {
        const calls = { users: 0, reads: 0, updates: 0 };
        const cache = new MemoryCache();
        cache.values.set("user-1", [storedPreference]);
        const service = new PreferenceService(createStore(calls), cache);

        await expect(service.get("user-1")).resolves.toEqual([storedPreference]);
        expect(calls).toEqual({ users: 0, reads: 0, updates: 0 });
    });

    it("loads a cache miss from the database and stores it", async () => {
        const calls = { users: 0, reads: 0, updates: 0 };
        const cache = new MemoryCache();
        const service = new PreferenceService(createStore(calls), cache);

        await service.get("user-1");

        expect(calls).toEqual({ users: 1, reads: 1, updates: 0 });
        expect(cache.values.get("user-1")).toEqual([storedPreference]);
    });

    it("invalidates the user cache after a successful update", async () => {
        const calls = { users: 0, reads: 0, updates: 0 };
        const cache = new MemoryCache();
        cache.values.set("user-1", [storedPreference]);
        const service = new PreferenceService(createStore(calls), cache);
        const input: PreferenceInput = {
            ...storedPreference,
            enabled: false,
        };

        await service.update("user-1", [input]);

        expect(calls.updates).toBe(1);
        expect(cache.invalidated).toEqual(["user-1"]);
        expect(cache.values.has("user-1")).toBe(false);
    });

    it("uses the database when Redis is unavailable", async () => {
        const calls = { users: 0, reads: 0, updates: 0 };
        const cache = new MemoryCache();
        cache.fail = true;
        const service = new PreferenceService(createStore(calls), cache);

        await expect(service.get("user-1")).resolves.toEqual([storedPreference]);
        expect(calls).toEqual({ users: 1, reads: 1, updates: 0 });
    });
});
