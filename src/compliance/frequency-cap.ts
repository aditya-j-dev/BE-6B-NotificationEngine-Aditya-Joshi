import type { NotificationChannel } from "../generated/prisma/enums";

export interface FrequencyCapPolicy {
    maxPerUserPerHour: number;
    maxPerUserEventPerDay: number;
    maxPerUserChannelPerDay: number;
}

export interface FrequencyCapRequest {
    userId: string;
    eventType: string;
    channel: NotificationChannel;
}

export interface RedisAtomicClient {
    eval(
        script: string,
        numberOfKeys: number,
        ...args: Array<string | number>
    ): Promise<unknown>;
}

export type FrequencyCapDimension =
    | "USER_HOURLY"
    | "USER_EVENT_DAILY"
    | "USER_CHANNEL_DAILY";

export type FrequencyCapResult =
    | { allowed: true }
    | {
        allowed: false;
        blockedDimension: FrequencyCapDimension;
        current: number;
        limit: number;
    };

export const DEFAULT_FREQUENCY_CAP_POLICY: FrequencyCapPolicy = {
    maxPerUserPerHour: 10,
    maxPerUserEventPerDay: 5,
    maxPerUserChannelPerDay: 20,
};

const CHECK_AND_INCREMENT_SCRIPT = `
for index, key in ipairs(KEYS) do
    local limit = tonumber(ARGV[(index - 1) * 2 + 1])
    local current = tonumber(redis.call("GET", key) or "0")
    if current >= limit then
        return {0, index, current, limit}
    end
end

for index, key in ipairs(KEYS) do
    local ttl = tonumber(ARGV[(index - 1) * 2 + 2])
    local count = redis.call("INCR", key)
    if count == 1 then
        redis.call("EXPIRE", key, ttl)
    end
end

return {1}
`;

/** Atomically enforces user, event, and channel notification limits. */
export class FrequencyCapService {
    constructor(
        private readonly redis: RedisAtomicClient,
        private readonly policy = DEFAULT_FREQUENCY_CAP_POLICY,
    ) { }

    async checkAndIncrement(
        request: FrequencyCapRequest,
        now = new Date(),
    ): Promise<FrequencyCapResult> {
        const dimensions = this.dimensions(request, now);
        const response = await this.redis.eval(
            CHECK_AND_INCREMENT_SCRIPT,
            dimensions.length,
            ...dimensions.map(({ key }) => key),
            ...dimensions.flatMap(({ limit, ttlSeconds }) => [limit, ttlSeconds]),
        );
        const result = this.parseResponse(response, dimensions);

        return result;
    }

    private dimensions(
        request: FrequencyCapRequest,
        now: Date,
    ): Array<{
        dimension: FrequencyCapDimension;
        key: string;
        limit: number;
        ttlSeconds: number;
    }> {
        const hourBucket = now.toISOString().slice(0, 13);
        const dayBucket = now.toISOString().slice(0, 10);

        return [
            {
                dimension: "USER_HOURLY",
                key: `notification:cap:user-hour:${request.userId}:${hourBucket}`,
                limit: this.policy.maxPerUserPerHour,
                ttlSeconds: this.secondsUntilNextHour(now),
            },
            {
                dimension: "USER_EVENT_DAILY",
                key: `notification:cap:user-event:${request.userId}:${request.eventType}:${dayBucket}`,
                limit: this.policy.maxPerUserEventPerDay,
                ttlSeconds: this.secondsUntilNextDay(now),
            },
            {
                dimension: "USER_CHANNEL_DAILY",
                key: `notification:cap:user-channel:${request.userId}:${request.channel}:${dayBucket}`,
                limit: this.policy.maxPerUserChannelPerDay,
                ttlSeconds: this.secondsUntilNextDay(now),
            },
        ];
    }

    private parseResponse(
        response: unknown,
        dimensions: Array<{
            dimension: FrequencyCapDimension;
            limit: number;
        }>,
    ): FrequencyCapResult {
        if (!Array.isArray(response) || response.length === 0) {
            throw new Error("Unexpected Redis frequency-cap response");
        }

        if (Number(response[0]) === 1) {
            return { allowed: true };
        }

        const index = Number(response[1]) - 1;
        const dimension = dimensions[index];

        if (!dimension) {
            throw new Error("Redis frequency-cap response referenced an unknown dimension");
        }

        return {
            allowed: false,
            blockedDimension: dimension.dimension,
            current: Number(response[2]),
            limit: Number(response[3]),
        };
    }

    private secondsUntilNextHour(now: Date): number {
        const nextHour = new Date(now);
        nextHour.setUTCMinutes(0, 0, 0);
        nextHour.setUTCHours(nextHour.getUTCHours() + 1);
        return Math.max(1, Math.ceil((nextHour.getTime() - now.getTime()) / 1000));
    }

    private secondsUntilNextDay(now: Date): number {
        const nextDay = new Date(now);
        nextDay.setUTCHours(0, 0, 0, 0);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        return Math.max(1, Math.ceil((nextDay.getTime() - now.getTime()) / 1000));
    }
}
