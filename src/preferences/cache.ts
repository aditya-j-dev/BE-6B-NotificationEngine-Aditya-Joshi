import type { UserPreferenceRecord } from "./types";

export interface PreferenceCache {
    get(userId: string): Promise<UserPreferenceRecord[] | null>;
    set(userId: string, preferences: UserPreferenceRecord[]): Promise<void>;
    invalidate(userId: string): Promise<void>;
}

export interface RedisPreferenceClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
    del(key: string): Promise<number>;
}

/** Redis-backed cache for a user's resolved preference records. */
export class RedisPreferenceCache implements PreferenceCache {
    constructor(
        private readonly redis: RedisPreferenceClient,
        private readonly ttlSeconds = 300,
    ) { }

    async get(userId: string): Promise<UserPreferenceRecord[] | null> {
        const key = this.key(userId);
        const cached = await this.redis.get(key);

        if (!cached) {
            return null;
        }

        try {
            const preferences: unknown = JSON.parse(cached);

            if (!Array.isArray(preferences)) {
                await this.redis.del(key);
                return null;
            }

            return preferences as UserPreferenceRecord[];
        } catch {
            await this.redis.del(key);
            return null;
        }
    }

    async set(
        userId: string,
        preferences: UserPreferenceRecord[],
    ): Promise<void> {
        await this.redis.set(
            this.key(userId),
            JSON.stringify(preferences),
            "EX",
            this.ttlSeconds,
        );
    }

    async invalidate(userId: string): Promise<void> {
        await this.redis.del(this.key(userId));
    }

    private key(userId: string): string {
        return `notification:preferences:${userId}`;
    }
}
