import type { EventPriority } from "../events/types";

import type { ExponentialBackoffPolicy } from "./backoff";

/** Part A §A9.1 retry table, mapped to ZeTheta's event-priority names. */
export const PRIORITY_RETRY_POLICIES: Readonly<Record<EventPriority, ExponentialBackoffPolicy>> = {
    CRITICAL: {
        maxRetries: 10,
        baseDelayMs: 500,
        maxDelayMs: 60_000,
        jitterMs: 1_000,
    },
    HIGH: {
        maxRetries: 5,
        baseDelayMs: 1_000,
        maxDelayMs: 300_000,
        jitterMs: 1_000,
    },
    // The specification calls this MEDIUM; ZeTheta's event schema calls it NORMAL.
    NORMAL: {
        maxRetries: 3,
        baseDelayMs: 5_000,
        maxDelayMs: 1_800_000,
        jitterMs: 1_000,
    },
    LOW: {
        maxRetries: 2,
        baseDelayMs: 30_000,
        maxDelayMs: 7_200_000,
        jitterMs: 1_000,
    },
    // VERY_LOW has no separate A9 row, so it deliberately uses the LOW policy.
    VERY_LOW: {
        maxRetries: 2,
        baseDelayMs: 30_000,
        maxDelayMs: 7_200_000,
        jitterMs: 1_000,
    },
};

export function retryPolicyForPriority(
    priority: EventPriority,
    policies: Readonly<Record<EventPriority, ExponentialBackoffPolicy>> = PRIORITY_RETRY_POLICIES,
): ExponentialBackoffPolicy {
    return policies[priority];
}
