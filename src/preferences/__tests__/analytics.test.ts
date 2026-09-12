import { describe, expect, it } from "vitest";

import {
    preferenceChanges,
    PreferenceService,
    RedisPreferenceAnalytics,
    type PreferenceAnalytics,
    type PreferenceInput,
    type PreferenceStore,
    type UserPreferenceRecord,
} from "../index";

const previous: UserPreferenceRecord = {
    userId: "user-1",
    eventCategory: "transaction",
    eventType: "TXNX-001",
    channel: "EMAIL",
    enabled: true,
    quietHoursOverride: false,
    digestMode: "immediate",
    priorityOverride: null,
};

class MemorySortedSets {
    private readonly values = new Map<string, Map<string, number>>();

    async zincrby(key: string, increment: number, member: string): Promise<string> {
        const members = this.values.get(key) ?? new Map<string, number>();
        const value = (members.get(member) ?? 0) + increment;
        members.set(member, value);
        this.values.set(key, members);
        return String(value);
    }

    async zrevrange(
        key: string,
        start: number,
        stop: number,
        withScores: "WITHSCORES",
    ): Promise<string[]> {
        void withScores;
        return [...(this.values.get(key) ?? new Map()).entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(start, stop + 1)
            .flatMap(([member, score]) => [member, String(score)]);
    }
}

function createStore(record: UserPreferenceRecord): PreferenceStore {
    const transaction = {
        user: {
            findUnique: async () => ({ id: record.userId }),
        },
        userPreference: {
            findMany: async () => [record],
            findUnique: async () => record,
            createMany: async () => ({ count: 0 }),
            upsert: async ({ update }: { update: PreferenceInput }) => ({
                ...record,
                ...update,
            }),
        },
    };

    return {
        ...transaction,
        $transaction: async <T>(operation: (value: typeof transaction) => Promise<T>) =>
            operation(transaction),
    } as PreferenceStore;
}

class RecordingAnalytics implements PreferenceAnalytics {
    readonly batches: ReturnType<typeof preferenceChanges>[] = [];

    async record(changes: ReturnType<typeof preferenceChanges>): Promise<void> {
        this.batches.push(changes);
    }
}

describe("preference change analytics", () => {
    it("records creation when no preference existed before", () => {
        expect(preferenceChanges(null, previous)).toEqual([
            expect.objectContaining({ field: "created" }),
        ]);
    });

    it("records only fields whose values changed", () => {
        expect(preferenceChanges(previous, {
            ...previous,
            enabled: false,
            digestMode: "daily",
        })).toEqual([
            expect.objectContaining({ field: "enabled" }),
            expect.objectContaining({ field: "digestMode" }),
        ]);
    });

    it("ranks the fields and targets that are changed most", async () => {
        const analytics = new RedisPreferenceAnalytics(new MemorySortedSets());
        const changes = preferenceChanges(previous, {
            ...previous,
            enabled: false,
            priorityOverride: 2,
        });

        await analytics.record([...changes, changes[0]]);

        await expect(analytics.mostChangedFields()).resolves.toEqual([
            { name: "enabled", count: 2 },
            { name: "priorityOverride", count: 1 },
        ]);
        await expect(analytics.mostChangedTargets()).resolves.toEqual([
            { name: "transaction:TXNX-001:EMAIL:enabled", count: 2 },
            { name: "transaction:TXNX-001:EMAIL:priorityOverride", count: 1 },
        ]);
    });

    it("records analytics only after a successful preference update", async () => {
        const analytics = new RecordingAnalytics();
        const service = new PreferenceService(createStore(previous), undefined, analytics);

        await service.update("user-1", [{ ...previous, enabled: false }]);

        expect(analytics.batches).toEqual([[
            expect.objectContaining({ field: "enabled" }),
        ]]);
    });

    it("does not record analytics when an update changes nothing", async () => {
        const analytics = new RecordingAnalytics();
        const service = new PreferenceService(createStore(previous), undefined, analytics);

        await service.update("user-1", [previous]);

        expect(analytics.batches).toEqual([]);
    });
});
