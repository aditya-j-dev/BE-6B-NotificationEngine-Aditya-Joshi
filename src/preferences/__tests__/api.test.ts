import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApiServer } from "../../api";
import {
    DEFAULT_PREFERENCE_DEFINITIONS,
    type PreferenceInput,
    type PreferenceStore,
    type UserPreferenceRecord,
} from "../index";

function preferenceKey(
    userId: string,
    preference: {
        eventCategory: string;
        eventType: string;
        channel: PreferenceInput["channel"];
    },
): string {
    return [userId, preference.eventCategory, preference.eventType, preference.channel]
        .join(":");
}

function createStore(): PreferenceStore {
    const preferences = new Map<string, UserPreferenceRecord>();
    const users = new Set(["user-1"]);

    const transaction = {
        user: {
            findUnique: async ({ where }: { where: { id: string } }) =>
                users.has(where.id) ? { id: where.id } : null,
        },
        userPreference: {
            findMany: async ({ where }: { where: { userId: string } }) =>
                [...preferences.values()]
                    .filter((preference) => preference.userId === where.userId)
                        .sort((left, right) => preferenceKey(left.userId, left)
                        .localeCompare(preferenceKey(right.userId, right))),
            findUnique: async ({ where }: {
                where: {
                    userId_eventCategory_eventType_channel: {
                        userId: string;
                        eventCategory: string;
                        eventType: string;
                        channel: PreferenceInput["channel"];
                    };
                };
            }) => preferences.get(preferenceKey(
                where.userId_eventCategory_eventType_channel.userId,
                where.userId_eventCategory_eventType_channel,
            )) ?? null,
            createMany: async ({ data }: { data: UserPreferenceRecord[] }) => {
                let count = 0;

                for (const preference of data) {
                    const key = preferenceKey(preference.userId, preference);

                    if (!preferences.has(key)) {
                        preferences.set(key, preference);
                        count += 1;
                    }
                }

                return { count };
            },
            upsert: async ({
                where,
                create,
                update,
            }: {
                where: {
                    userId_eventCategory_eventType_channel: {
                        userId: string;
                        eventCategory: string;
                        eventType: string;
                        channel: PreferenceInput["channel"];
                    };
                };
                create: UserPreferenceRecord;
                update: PreferenceInput;
            }) => {
                const key = preferenceKey(
                    where.userId_eventCategory_eventType_channel.userId,
                    where.userId_eventCategory_eventType_channel,
                );
                const existing = preferences.get(key);
                const record = existing ? { ...existing, ...update } : create;

                preferences.set(key, record);
                return record;
            },
        },
    };

    return {
        ...transaction,
        $transaction: async <T>(operation: (value: typeof transaction) => Promise<T>) =>
            operation(transaction),
    } as PreferenceStore;
}

describe("preference API", () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
        server = createApiServer(createStore());
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();

        if (!address || typeof address === "string") {
            throw new Error("Test server did not bind to a TCP port");
        }

        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => server.close((error) =>
            error ? reject(error) : resolve(),
        ));
    });

    it("migrates an existing user to default preferences on first access", async () => {
        const response = await fetch(`${baseUrl}/users/user-1/preferences`);
        const payload = await response.json() as {
            userId: string;
            preferences: UserPreferenceRecord[];
        };

        expect(response.status).toBe(200);
        expect(payload).toMatchObject({
            userId: "user-1",
            preferences: expect.arrayContaining([
                expect.objectContaining({
                    eventType: "TXNX-001",
                    channel: "SMS",
                    enabled: true,
                }),
            ]),
        });
        expect(payload.preferences).toHaveLength(DEFAULT_PREFERENCE_DEFINITIONS.length);
    });

    it("upserts preferences and applies API defaults", async () => {
        const response = await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                preferences: [{
                    eventCategory: "transaction",
                    channel: "EMAIL",
                }],
            }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            userId: "user-1",
            preferences: [{
                userId: "user-1",
                eventCategory: "transaction",
                eventType: "*",
                channel: "EMAIL",
                enabled: true,
                quietHoursOverride: false,
                digestMode: "immediate",
                priorityOverride: null,
            }],
        });
    });

    it("returns stored preferences through GET after an update", async () => {
        await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                preferences: [{
                    eventCategory: "risk_margin",
                    eventType: "RISK-002",
                    channel: "SMS",
                    enabled: false,
                    quietHoursOverride: true,
                    digestMode: "immediate",
                    priorityOverride: 1,
                }],
            }),
        });

        const response = await fetch(`${baseUrl}/users/user-1/preferences`);
        const payload = await response.json() as { preferences: UserPreferenceRecord[] };

        expect(response.status).toBe(200);
        expect(payload.preferences).toEqual(expect.arrayContaining([
            expect.objectContaining({
                eventType: "RISK-002",
                channel: "SMS",
                enabled: false,
                priorityOverride: 1,
            }),
        ]));
    });

    it("returns 404 when the user does not exist", async () => {
        const response = await fetch(`${baseUrl}/users/missing/preferences`);

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({
            error: "USER_NOT_FOUND",
            userId: "missing",
        });
    });

    it("returns 404 when updating preferences for a missing user", async () => {
        const response = await fetch(`${baseUrl}/users/missing/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                preferences: [{
                    eventCategory: "transaction",
                    channel: "EMAIL",
                }],
            }),
        });

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({
            error: "USER_NOT_FOUND",
            userId: "missing",
        });
    });

    it("rejects duplicate preference keys", async () => {
        const preference = {
            eventCategory: "transaction",
            eventType: "TXNX-001",
            channel: "PUSH",
        };
        const response = await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ preferences: [preference, preference] }),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: "INVALID_PREFERENCE_PAYLOAD",
        });
    });

    it.each([
        { preferences: [] },
        { preferences: [{ eventCategory: "unknown", channel: "SMS" }] },
        { preferences: [{ eventCategory: "transaction", channel: "LETTER" }] },
        { preferences: [{ eventCategory: "transaction", channel: "SMS", priorityOverride: 6 }] },
        { preferences: [{ eventCategory: "transaction", channel: "SMS", digestMode: "weekly" }] },
        { preferences: [{ eventCategory: "transaction", eventType: "", channel: "SMS" }] },
    ])("rejects invalid preference payload %#", async (payload) => {
        const response = await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: "INVALID_PREFERENCE_PAYLOAD",
        });
    });

    it("updates an existing preference without creating a duplicate", async () => {
        const first = {
            eventCategory: "market_price",
            eventType: "MKTX-001",
            channel: "PUSH",
            enabled: true,
            quietHoursOverride: false,
            digestMode: "hourly",
            priorityOverride: null,
        };
        const second = { ...first, enabled: false, priorityOverride: 3 };

        await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ preferences: [first] }),
        });
        await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ preferences: [second] }),
        });
        const response = await fetch(`${baseUrl}/users/user-1/preferences?view=all`);
        const payload = await response.json() as { preferences: UserPreferenceRecord[] };
        const matching = payload.preferences.filter((preference) =>
            preference.eventType === "MKTX-001" && preference.channel === "PUSH",
        );

        expect(response.status).toBe(200);
        expect(matching).toEqual([expect.objectContaining({
            enabled: false,
            priorityOverride: 3,
            digestMode: "hourly",
        })]);
    });

    it("returns 404 for an unknown API route", async () => {
        const response = await fetch(`${baseUrl}/users/user-1/unknown`);

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "NOT_FOUND" });
    });

    it("rejects an oversized request body", async () => {
        const response = await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                preferences: [{
                    eventCategory: "transaction",
                    channel: "SMS",
                    eventType: "X".repeat(1_000_001),
                }],
            }),
        });

        expect(response.status).toBe(413);
        await expect(response.json()).resolves.toEqual({ error: "PAYLOAD_TOO_LARGE" });
    });

    it("rejects malformed JSON and unsupported methods", async () => {
        const malformed = await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: "{",
        });
        const unsupported = await fetch(`${baseUrl}/users/user-1/preferences`, {
            method: "POST",
        });

        expect(malformed.status).toBe(400);
        expect(unsupported.status).toBe(405);
        expect(unsupported.headers.get("allow")).toBe("GET, PUT");
    });
});
