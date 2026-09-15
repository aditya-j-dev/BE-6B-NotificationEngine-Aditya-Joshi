/** The Part A §A9.1 default policy: 1s base, 5m cap, and 0-1000ms jitter. */
export interface ExponentialBackoffPolicy {
    baseDelayMs: number;
    maxDelayMs: number;
    jitterMs: number;
    maxRetries: number;
}

export const DEFAULT_RETRY_POLICY: ExponentialBackoffPolicy = {
    baseDelayMs: 1_000,
    maxDelayMs: 300_000,
    jitterMs: 1_000,
    maxRetries: 5,
};

/**
 * Returns a delay for a one-based retry attempt. Attempt 1 is approximately
 * 1-2 seconds under the default policy, then 2-3, 4-5, and so on.
 */
export function calculateRetryDelay(
    attempt: number,
    policy: ExponentialBackoffPolicy = DEFAULT_RETRY_POLICY,
    random: () => number = Math.random,
): number {
    validateAttempt(attempt);
    validatePolicy(policy);

    const jitter = Math.floor(Math.max(0, Math.min(random(), 0.999_999_999)) * (policy.jitterMs + 1));
    const exponentialDelay = policy.baseDelayMs * (2 ** (attempt - 1));
    return Math.min(exponentialDelay + jitter, policy.maxDelayMs);
}

function validateAttempt(attempt: number): void {
    if (!Number.isInteger(attempt) || attempt < 1) {
        throw new Error("Retry attempt must be a positive integer");
    }
}

function validatePolicy(policy: ExponentialBackoffPolicy): void {
    if (
        policy.baseDelayMs < 1
        || policy.maxDelayMs < policy.baseDelayMs
        || policy.jitterMs < 0
        || policy.maxRetries < 1
    ) {
        throw new Error("Invalid exponential backoff retry policy");
    }
}
