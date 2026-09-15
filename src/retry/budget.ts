import type { RetryGate, RetryGateResult, RetryJob } from "./worker";

export interface RetryBudgetPolicy {
    maxGlobalRetriesPerMinute: number;
    maxProviderRetriesPerMinute: number;
    maxProviderRetriesPerHour: number;
}

export const DEFAULT_RETRY_BUDGET_POLICY: RetryBudgetPolicy = {
    maxGlobalRetriesPerMinute: 1_000,
    maxProviderRetriesPerMinute: 250,
    maxProviderRetriesPerHour: 5_000,
};

export type RetryBudgetDimension = "GLOBAL_MINUTE" | "PROVIDER_MINUTE" | "PROVIDER_HOUR";

export type RetryBudgetResult =
    | { allowed: true }
    | { allowed: false; blockedDimension: RetryBudgetDimension; current: number; limit: number; retryAfterMs: number };

export interface RedisRetryBudgetClient {
    eval(script: string, numberOfKeys: number, ...arguments_: Array<string | number>): Promise<unknown>;
}

const CHECK_AND_INCREMENT_RETRY_BUDGET = `
for index, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[(index - 1) * 2 + 1])
  local current = tonumber(redis.call('GET', key) or '0')
  if current >= limit then
    local ttl = tonumber(redis.call('TTL', key) or '1')
    return {0, index, current, limit, math.max(1, ttl)}
  end
end

for index, key in ipairs(KEYS) do
  local ttl = tonumber(ARGV[(index - 1) * 2 + 2])
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('EXPIRE', key, ttl)
  end
end

return {1}
`;

/** Atomically grants retry capacity across global and provider-specific windows. */
export class RetryBudgetMonitor {
    constructor(
        private readonly redis: RedisRetryBudgetClient,
        private readonly policy: RetryBudgetPolicy = DEFAULT_RETRY_BUDGET_POLICY,
    ) {
        if (Object.values(policy).some((limit) => !Number.isInteger(limit) || limit < 1)) {
            throw new Error("Retry budget limits must be positive integers");
        }
    }

    async consume(provider: string, now = new Date()): Promise<RetryBudgetResult> {
        const dimensions = this.dimensions(provider, now);
        const response = await this.redis.eval(
            CHECK_AND_INCREMENT_RETRY_BUDGET,
            dimensions.length,
            ...dimensions.map(({ key }) => key),
            ...dimensions.flatMap(({ limit, ttlSeconds }) => [limit, ttlSeconds]),
        );
        return this.parseResponse(response, dimensions);
    }

    private dimensions(provider: string, now: Date): Array<{
        dimension: RetryBudgetDimension;
        key: string;
        limit: number;
        ttlSeconds: number;
    }> {
        const minuteBucket = now.toISOString().slice(0, 16);
        const hourBucket = now.toISOString().slice(0, 13);
        const safeProvider = encodeURIComponent(provider);

        return [
            {
                dimension: "GLOBAL_MINUTE",
                key: `notification:retry-budget:global:${minuteBucket}`,
                limit: this.policy.maxGlobalRetriesPerMinute,
                ttlSeconds: this.secondsUntilNextMinute(now),
            },
            {
                dimension: "PROVIDER_MINUTE",
                key: `notification:retry-budget:provider-minute:${safeProvider}:${minuteBucket}`,
                limit: this.policy.maxProviderRetriesPerMinute,
                ttlSeconds: this.secondsUntilNextMinute(now),
            },
            {
                dimension: "PROVIDER_HOUR",
                key: `notification:retry-budget:provider-hour:${safeProvider}:${hourBucket}`,
                limit: this.policy.maxProviderRetriesPerHour,
                ttlSeconds: this.secondsUntilNextHour(now),
            },
        ];
    }

    private parseResponse(
        response: unknown,
        dimensions: Array<{ dimension: RetryBudgetDimension; limit: number }>,
    ): RetryBudgetResult {
        if (!Array.isArray(response) || response.length === 0) {
            throw new Error("Unexpected Redis retry-budget response");
        }
        if (Number(response[0]) === 1) return { allowed: true };

        const index = Number(response[1]) - 1;
        const dimension = dimensions[index];
        if (!dimension) {
            throw new Error("Redis retry-budget response referenced an unknown dimension");
        }

        return {
            allowed: false,
            blockedDimension: dimension.dimension,
            current: Number(response[2]),
            limit: Number(response[3]),
            retryAfterMs: Math.max(1, Number(response[4])) * 1_000,
        };
    }

    private secondsUntilNextMinute(now: Date): number {
        const next = new Date(now);
        next.setUTCSeconds(0, 0);
        next.setUTCMinutes(next.getUTCMinutes() + 1);
        return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1_000));
    }

    private secondsUntilNextHour(now: Date): number {
        const next = new Date(now);
        next.setUTCMinutes(0, 0, 0);
        next.setUTCHours(next.getUTCHours() + 1);
        return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1_000));
    }
}

/** Adapts provider-aware retry budgets to the generic retry worker. */
export class ProviderRetryBudgetGate<T> implements RetryGate<T> {
    constructor(
        private readonly monitor: RetryBudgetMonitor,
        private readonly providerFor: (job: RetryJob<T>) => string,
    ) { }

    async tryAcquire(job: RetryJob<T>): Promise<RetryGateResult> {
        const result = await this.monitor.consume(this.providerFor(job));
        return result.allowed
            ? result
            : { allowed: false, retryAfterMs: result.retryAfterMs };
    }
}
