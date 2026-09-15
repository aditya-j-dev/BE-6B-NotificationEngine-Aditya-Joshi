import type { RetryJob, RetryScheduler } from "./worker";

export interface RedisRetrySchedulerClient {
    hset(key: string, field: string, value: string): Promise<number>;
    hget(key: string, field: string): Promise<string | null>;
    hdel(key: string, ...fields: string[]): Promise<number>;
    zadd(key: string, score: number, member: string): Promise<number>;
    eval(script: string, numberOfKeys: number, ...arguments_: string[]): Promise<unknown>;
}

const CLAIM_DUE_RETRY_JOBS = `
local jobs = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, ARGV[2])
if #jobs > 0 then
  redis.call('ZREM', KEYS[1], unpack(jobs))
end
return jobs
`;

/**
 * Redis sorted-set scheduler for retry jobs. `ZADD` stores each stable job ID
 * at its retry timestamp; the payload is kept separately in a Redis hash so
 * rescheduling the same notification updates rather than duplicates its job.
 */
export class RedisSortedSetRetryScheduler<T> implements RetryScheduler<T> {
    private readonly payloadKey: string;

    constructor(
        private readonly redis: RedisRetrySchedulerClient,
        private readonly queueKey = "notification:retry:schedule",
        private readonly now: () => Date = () => new Date(),
    ) {
        this.payloadKey = `${queueKey}:payloads`;
    }

    async schedule(job: RetryJob<T>, dueAt: Date): Promise<void> {
        if (Number.isNaN(dueAt.valueOf())) {
            throw new Error("Retry due time must be a valid date");
        }

        await this.redis.hset(this.payloadKey, job.id, JSON.stringify(job));
        await this.redis.zadd(this.queueKey, dueAt.getTime(), job.id);
    }

    /** Atomically claims up to `limit` jobs whose retry score is due. */
    async claimDue(limit = 100, at: Date = this.now()): Promise<RetryJob<T>[]> {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new Error("Retry claim limit must be a positive integer");
        }
        if (Number.isNaN(at.valueOf())) {
            throw new Error("Retry claim time must be a valid date");
        }

        const claimed = await this.redis.eval(
            CLAIM_DUE_RETRY_JOBS,
            1,
            this.queueKey,
            String(at.getTime()),
            String(limit),
        );
        if (!Array.isArray(claimed) || !claimed.every((id) => typeof id === "string")) {
            throw new Error("Redis returned an invalid retry claim response");
        }

        const jobs = await Promise.all(claimed.map(async (id) => {
            const serialized = await this.redis.hget(this.payloadKey, id);
            await this.redis.hdel(this.payloadKey, id);
            return this.parseJob(serialized);
        }));
        return jobs.filter((job): job is RetryJob<T> => job !== null);
    }

    private parseJob(serialized: string | null): RetryJob<T> | null {
        if (!serialized) return null;

        try {
            const parsed: unknown = JSON.parse(serialized);
            if (
                typeof parsed === "object"
                && parsed !== null
                && "id" in parsed
                && typeof parsed.id === "string"
                && "payload" in parsed
                && "attemptsMade" in parsed
                && typeof parsed.attemptsMade === "number"
            ) {
                return parsed as RetryJob<T>;
            }
        } catch {
            // The corrupt job was already removed from the schedule and payload hash.
        }

        return null;
    }
}
