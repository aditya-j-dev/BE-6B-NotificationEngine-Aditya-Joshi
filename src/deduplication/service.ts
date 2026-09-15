import { Redis } from "ioredis";
import { RedisConnectionPool, type RedisPoolClient } from "./redis-pool";

export class EventDeduplicationService {
    private readonly redis?: Redis;
    private readonly redisPool?: RedisConnectionPool;

    constructor(
        redisUrlOrPool: string | RedisConnectionPool =
            process.env.REDIS_URL ??
            "redis://localhost:6380",
        private readonly ttlSeconds = 86400,
    ) {
        if (typeof redisUrlOrPool === "string") {
            this.redis = new Redis(redisUrlOrPool, { enableAutoPipelining: true });
        } else {
            this.redisPool = redisUrlOrPool;
        }
    }

    async isDuplicate(
        eventId: string,
    ): Promise<boolean> {
        const key = `notification:dedup:${eventId}`;

        const result = await this.client().set(
            key,
            "1",
            "EX",
            this.ttlSeconds,
            "NX",
        );

        /*
         * SET returns "OK" when the key was created.
         * null means the key already existed.
         */
        return result === null;
    }

    async close(): Promise<void> {
        if (this.redis) await this.redis.quit();
    }

    private client(): RedisPoolClient {
        const client = this.redisPool?.next() ?? this.redis;
        if (!client) throw new Error("Event deduplication Redis client is unavailable");
        return client;
    }
}
