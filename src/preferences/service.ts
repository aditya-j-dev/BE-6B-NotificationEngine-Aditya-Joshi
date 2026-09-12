import type { PreferenceCache } from "./cache";
import {
    preferenceChanges,
    type PreferenceAnalytics,
    type PreferenceChange,
} from "./analytics";
import { defaultPreferencesForUser } from "./defaults";
import type { PreferenceInput, UserPreferenceRecord } from "./types";

interface PreferenceTransaction {
    user: {
        findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null>;
    };
    userPreference: {
        findMany(args: {
            where: { userId: string };
            orderBy: [{ eventCategory: "asc" }, { eventType: "asc" }, { channel: "asc" }];
        }): Promise<UserPreferenceRecord[]>;
        findUnique(args: {
            where: {
                userId_eventCategory_eventType_channel: {
                    userId: string;
                    eventCategory: string;
                    eventType: string;
                    channel: PreferenceInput["channel"];
                };
            };
        }): Promise<UserPreferenceRecord | null>;
        createMany(args: {
            data: UserPreferenceRecord[];
            skipDuplicates: true;
        }): Promise<{ count: number }>;
        upsert(args: {
            where: {
                userId_eventCategory_eventType_channel: {
                    userId: string;
                    eventCategory: string;
                    eventType: string;
                    channel: PreferenceInput["channel"];
                };
            };
            create: UserPreferenceRecord;
            update: Omit<UserPreferenceRecord, "userId">;
        }): Promise<UserPreferenceRecord>;
    };
}

export interface PreferenceStore extends PreferenceTransaction {
    $transaction<T>(
        operation: (transaction: PreferenceTransaction) => Promise<T>,
    ): Promise<T>;
}

export class UserNotFoundError extends Error {
    constructor(readonly userId: string) {
        super(`User ${userId} was not found`);
        this.name = "UserNotFoundError";
    }
}

export class PreferenceService {
    constructor(
        private readonly store: PreferenceStore,
        private readonly cache?: PreferenceCache,
        private readonly analytics?: PreferenceAnalytics,
    ) { }

    async get(userId: string): Promise<UserPreferenceRecord[]> {
        const cached = await this.readCache(userId);

        if (cached) {
            return cached;
        }

        const preferences = await this.store.$transaction((transaction) =>
            this.ensureDefaultPreferences(transaction, userId),
        );

        await this.writeCache(userId, preferences);

        return preferences;
    }

    async update(
        userId: string,
        preferences: PreferenceInput[],
    ): Promise<UserPreferenceRecord[]> {
        const { updated, changes } = await this.store.$transaction(async (transaction) => {
            const user = await transaction.user.findUnique({
                where: { id: userId },
                select: { id: true },
            });

            if (!user) {
                throw new UserNotFoundError(userId);
            }

            await this.ensureDefaultPreferences(transaction, userId);

            const results = await Promise.all(preferences.map(async (preference) => {
                const where = {
                    userId_eventCategory_eventType_channel: {
                        userId,
                        eventCategory: preference.eventCategory,
                        eventType: preference.eventType,
                        channel: preference.channel,
                    },
                };
                const previous = await transaction.userPreference.findUnique({ where });
                const next = await transaction.userPreference.upsert({
                    where: {
                        ...where,
                    },
                    create: { userId, ...preference },
                    update: preference,
                });

                return { next, changes: preferenceChanges(previous, next) };
            }));

            return {
                updated: results.map(({ next }) => next),
                changes: results.flatMap(({ changes: preferenceChanges }) => preferenceChanges),
            };
        });

        await this.invalidateCache(userId);
        await this.recordAnalytics(changes);

        return updated;
    }

    private async ensureDefaultPreferences(
        transaction: PreferenceTransaction,
        userId: string,
    ): Promise<UserPreferenceRecord[]> {
        const user = await transaction.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        if (!user) {
            throw new UserNotFoundError(userId);
        }

        const existing = await transaction.userPreference.findMany({
            where: { userId },
            orderBy: [
                { eventCategory: "asc" },
                { eventType: "asc" },
                { channel: "asc" },
            ],
        });

        if (existing.length > 0) {
            return existing;
        }

        await transaction.userPreference.createMany({
            data: defaultPreferencesForUser(userId),
            skipDuplicates: true,
        });

        return transaction.userPreference.findMany({
            where: { userId },
            orderBy: [
                { eventCategory: "asc" },
                { eventType: "asc" },
                { channel: "asc" },
            ],
        });
    }

    private async readCache(
        userId: string,
    ): Promise<UserPreferenceRecord[] | null> {
        try {
            return await this.cache?.get(userId) ?? null;
        } catch {
            return null;
        }
    }

    private async writeCache(
        userId: string,
        preferences: UserPreferenceRecord[],
    ): Promise<void> {
        try {
            await this.cache?.set(userId, preferences);
        } catch {
            // A cache miss is safe: the database remains the source of truth.
        }
    }

    private async invalidateCache(userId: string): Promise<void> {
        try {
            await this.cache?.invalidate(userId);
        } catch {
            // Expiry bounds stale data if Redis is temporarily unavailable.
        }
    }

    private async recordAnalytics(changes: PreferenceChange[]): Promise<void> {
        if (changes.length === 0) {
            return;
        }

        try {
            await this.analytics?.record(changes);
        } catch {
            // Analytics must not turn a successful preference update into an error.
        }
    }
}
