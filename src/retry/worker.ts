import type { DeliveryResult } from "../providers";
import type { EventPriority } from "../events/types";

import { calculateRetryDelay, type ExponentialBackoffPolicy, DEFAULT_RETRY_POLICY } from "./backoff";
import { PRIORITY_RETRY_POLICIES, retryPolicyForPriority } from "./priority-policy";

export interface RetryJob<T> {
    /** Stable key used by a later scheduler to deduplicate the retry job. */
    id: string;
    payload: T;
    /** Number of prior retry executions. The initial retry job uses 0. */
    attemptsMade: number;
}

export interface RetryScheduler<T> {
    schedule(job: RetryJob<T>, dueAt: Date): Promise<void>;
}

export type RetryGateResult = { allowed: true } | { allowed: false; retryAfterMs: number };

export interface RetryGate<T> {
    tryAcquire(job: RetryJob<T>): Promise<RetryGateResult>;
}

export interface PriorityRetryJob<T> extends RetryJob<T> {
    priority: EventPriority;
}

export type RetryWorkerResult =
    | { outcome: "DELIVERED"; result: Exclude<DeliveryResult, { status: "FAILED" }> }
    | { outcome: "SCHEDULED"; result: Extract<DeliveryResult, { status: "FAILED" }>; nextAttempt: number; dueAt: Date }
    | { outcome: "RETRY_BUDGET_EXHAUSTED"; result: Extract<DeliveryResult, { status: "FAILED" }>; retryAfterMs: number }
    | { outcome: "PERMANENT_FAILURE"; result: Extract<DeliveryResult, { status: "FAILED" }> }
    | { outcome: "RETRIES_EXHAUSTED"; result: Extract<DeliveryResult, { status: "FAILED" }> };

/**
 * Executes one delivery attempt and schedules only retryable failures. It does
 * not sleep in-process; Day 9.3 supplies the durable Redis scheduler.
 */
export class RetryWorker<T> {
    constructor(
        private readonly scheduler: RetryScheduler<T>,
        private readonly policy: ExponentialBackoffPolicy = DEFAULT_RETRY_POLICY,
        private readonly now: () => Date = () => new Date(),
        private readonly random: () => number = Math.random,
        private readonly retryGate?: RetryGate<T>,
    ) { }

    async process(
        job: RetryJob<T>,
        deliver: (payload: T) => Promise<DeliveryResult>,
    ): Promise<RetryWorkerResult> {
        const result = await deliver(job.payload);
        if (result.status !== "FAILED") {
            return { outcome: "DELIVERED", result };
        }

        if (!result.retryable) {
            return { outcome: "PERMANENT_FAILURE", result };
        }

        const nextAttempt = job.attemptsMade + 1;
        if (nextAttempt > this.policy.maxRetries) {
            return { outcome: "RETRIES_EXHAUSTED", result };
        }

        const budget = this.retryGate ? await this.retryGate.tryAcquire(job) : { allowed: true } as const;
        if (!budget.allowed) {
            return { outcome: "RETRY_BUDGET_EXHAUSTED", result, retryAfterMs: budget.retryAfterMs };
        }

        const delayMs = calculateRetryDelay(nextAttempt, this.policy, this.random);
        const dueAt = new Date(this.now().getTime() + delayMs);
        await this.scheduler.schedule({ ...job, attemptsMade: nextAttempt }, dueAt);
        return { outcome: "SCHEDULED", result, nextAttempt, dueAt };
    }
}

/** Applies the A9 priority policy table before delegating to the retry worker. */
export class PriorityRetryWorker<T> {
    constructor(
        private readonly scheduler: RetryScheduler<T>,
        private readonly policies: Readonly<Record<EventPriority, ExponentialBackoffPolicy>> = PRIORITY_RETRY_POLICIES,
        private readonly now: () => Date = () => new Date(),
        private readonly random: () => number = Math.random,
        private readonly retryGate?: RetryGate<T>,
    ) { }

    process(
        job: PriorityRetryJob<T>,
        deliver: (payload: T) => Promise<DeliveryResult>,
    ): Promise<RetryWorkerResult> {
        const worker = new RetryWorker(
            this.scheduler,
            retryPolicyForPriority(job.priority, this.policies),
            this.now,
            this.random,
            this.retryGate,
        );
        return worker.process(job, deliver);
    }
}
