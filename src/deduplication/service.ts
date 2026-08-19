import { Redis } from "ioredis";

export class EventDeduplicationService {
    private readonly redis: Redis;

    constructor(
        redisUrl =
            process.env.REDIS_URL ??
            "redis://localhost:6380",
        private readonly ttlSeconds = 86400,
    ) {
        this.redis = new Redis(redisUrl);
    }

    async isDuplicate(
        eventId: string,
    ): Promise<boolean> {
        const key = `notification:dedup:${eventId}`;

        const result = await this.redis.set(
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
        await this.redis.quit();
    }
}