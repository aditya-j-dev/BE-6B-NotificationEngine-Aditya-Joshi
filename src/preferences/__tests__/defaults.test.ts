import { describe, expect, it } from "vitest";

import {
    DEFAULT_PREFERENCE_DEFINITIONS,
    defaultPreferencesForUser,
    PreferenceService,
    type PreferenceStore,
    type UserPreferenceRecord,
} from "../index";

function preferenceKey(preference: UserPreferenceRecord): string {
    return [
        preference.userId,
        preference.eventCategory,
        preference.eventType,
        preference.channel,
    ].join(":");
}

function createStore(initial: UserPreferenceRecord[] = []) {
    const preferences = new Map(initial.map((preference) => [
        preferenceKey(preference),
        preference,
    ]));
    let createManyCalls = 0;
    const transaction = {
        user: {
            findUnique: async () => ({ id: "user-1" }),
        },
        userPreference: {
            findMany: async () => [...preferences.values()],
            findUnique: async () => null,
            createMany: async ({ data }: { data: UserPreferenceRecord[] }) => {
                createManyCalls += 1;
                data.forEach((preference) => preferences.set(
                    preferenceKey(preference),
                    preference,
                ));
                return { count: data.length };
            },
            upsert: async ({ create }: { create: UserPreferenceRecord }) => create,
        },
    };

    return {
        store: {
            ...transaction,
            $transaction: async <T>(operation: (value: typeof transaction) => Promise<T>) =>
                operation(transaction),
        } as PreferenceStore,
        preferences,
        getCreateManyCalls: () => createManyCalls,
    };
}

describe("default preference migration", () => {
    it("defines defaults for every one of the 25 financial event types", () => {
        expect(new Set(DEFAULT_PREFERENCE_DEFINITIONS.map(
            ({ eventType }) => eventType,
        )).size).toBe(25);
        expect(DEFAULT_PREFERENCE_DEFINITIONS.every(
            ({ enabled, digestMode }) => enabled && digestMode === "immediate",
        )).toBe(true);
    });

    it("creates the default set for a user without preferences on first access", async () => {
        const fixture = createStore();
        const service = new PreferenceService(fixture.store);

        const preferences = await service.get("user-1");

        expect(fixture.getCreateManyCalls()).toBe(1);
        expect(preferences).toEqual(defaultPreferencesForUser("user-1"));
    });

    it("does not recreate defaults on later accesses", async () => {
        const fixture = createStore();
        const service = new PreferenceService(fixture.store);

        await service.get("user-1");
        await service.get("user-1");

        expect(fixture.getCreateManyCalls()).toBe(1);
    });

    it("does not modify a user who already has a preference", async () => {
        const customPreference: UserPreferenceRecord = {
            ...defaultPreferencesForUser("user-1")[0],
            enabled: false,
        };
        const fixture = createStore([customPreference]);
        const service = new PreferenceService(fixture.store);

        await expect(service.get("user-1")).resolves.toEqual([customPreference]);
        expect(fixture.getCreateManyCalls()).toBe(0);
    });
});
