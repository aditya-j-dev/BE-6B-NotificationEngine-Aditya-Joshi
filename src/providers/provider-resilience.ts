import type {
    DeliveryProvider,
    DeliveryResult,
    DeliveryStatus,
    PreparedNotification,
    QuotaInfo,
    ValidationResult,
} from "./delivery-provider";

export interface ProviderRateLimitPolicy {
    maxRequests: number;
    windowMs: number;
}

export interface CircuitBreakerPolicy {
    failureThreshold: number;
    cooldownMs: number;
}

export interface ProviderPerformanceThresholdPolicy {
    /** Minimum number of recent sends before the provider is evaluated. */
    minimumSamples: number;
    /** Fraction from 0 (exclusive) to 1 (inclusive), e.g. 0.25 for 25%. */
    failureRateThreshold: number;
    /** Maximum allowed average provider response time in milliseconds. */
    averageResponseTimeThresholdMs: number;
    /** Rolling observation window for this provider. */
    windowMs: number;
}

export interface ProviderPerformanceAssessment {
    provider: string;
    sampleCount: number;
    failureRate: number;
    averageResponseTimeMs: number;
    failureRateExceeded: boolean;
    responseTimeExceeded: boolean;
    thresholdExceeded: boolean;
}

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface ProviderRateLimiter {
    tryAcquire(provider: string): { allowed: true } | { allowed: false; retryAfterMs: number };
}

interface RateLimitWindow {
    startedAt: number;
    requests: number;
}

/** In-process fixed-window limiter; replaceable with a distributed store in deployment. */
export class FixedWindowProviderRateLimiter implements ProviderRateLimiter {
    private readonly windows = new Map<string, RateLimitWindow>();

    constructor(
        private readonly policy: ProviderRateLimitPolicy,
        private readonly now: () => number = Date.now,
    ) {
        if (policy.maxRequests < 1 || policy.windowMs < 1) {
            throw new Error("Provider rate-limit policy values must be positive");
        }
    }

    tryAcquire(provider: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
        const timestamp = this.now();
        const current = this.windows.get(provider);
        const window = !current || timestamp - current.startedAt >= this.policy.windowMs
            ? { startedAt: timestamp, requests: 0 }
            : current;

        if (window.requests >= this.policy.maxRequests) {
            return {
                allowed: false,
                retryAfterMs: Math.max(1, this.policy.windowMs - (timestamp - window.startedAt)),
            };
        }

        window.requests += 1;
        this.windows.set(provider, window);
        return { allowed: true };
    }
}

interface CircuitRecord {
    state: CircuitBreakerState;
    consecutiveFailures: number;
    openedAt: number | null;
    probeInFlight: boolean;
}

interface ProviderPerformanceSample {
    occurredAt: number;
    failed: boolean;
    responseTimeMs: number;
}

/**
 * Evaluates each provider against its own recent failure-rate and latency
 * thresholds. Policies are deliberately injected so production limits remain
 * configuration, rather than hard-coded provider assumptions.
 */
export class ProviderPerformanceThresholdMonitor {
    private readonly samples = new Map<string, ProviderPerformanceSample[]>();

    constructor(
        private readonly policies: Readonly<Record<string, ProviderPerformanceThresholdPolicy>>,
        private readonly now: () => number = Date.now,
    ) {
        Object.entries(policies).forEach(([provider, policy]) => this.validatePolicy(provider, policy));
    }

    record(provider: string, failed: boolean, responseTimeMs: number): ProviderPerformanceAssessment | null {
        const policy = this.policies[provider];
        if (!policy) return null;

        const timestamp = this.now();
        const retained = (this.samples.get(provider) ?? []).filter(
            (sample) => timestamp - sample.occurredAt < policy.windowMs,
        );
        retained.push({
            occurredAt: timestamp,
            failed,
            responseTimeMs: Math.max(0, responseTimeMs),
        });
        this.samples.set(provider, retained);

        const sampleCount = retained.length;
        const failureRate = retained.filter((sample) => sample.failed).length / sampleCount;
        const averageResponseTimeMs = retained.reduce(
            (total, sample) => total + sample.responseTimeMs,
            0,
        ) / sampleCount;
        const ready = sampleCount >= policy.minimumSamples;
        const failureRateExceeded = ready && failureRate >= policy.failureRateThreshold;
        const responseTimeExceeded = ready && averageResponseTimeMs >= policy.averageResponseTimeThresholdMs;

        return {
            provider,
            sampleCount,
            failureRate,
            averageResponseTimeMs,
            failureRateExceeded,
            responseTimeExceeded,
            thresholdExceeded: failureRateExceeded || responseTimeExceeded,
        };
    }

    private validatePolicy(provider: string, policy: ProviderPerformanceThresholdPolicy): void {
        if (
            policy.minimumSamples < 1
            || policy.failureRateThreshold <= 0
            || policy.failureRateThreshold > 1
            || policy.averageResponseTimeThresholdMs < 1
            || policy.windowMs < 1
        ) {
            throw new Error(`Invalid performance threshold policy for provider ${provider}`);
        }
    }
}

/** A provider circuit breaker with CLOSED, OPEN, and one-probe HALF_OPEN states. */
export class ProviderCircuitBreaker {
    private readonly records = new Map<string, CircuitRecord>();

    constructor(
        private readonly policy: CircuitBreakerPolicy,
        private readonly now: () => number = Date.now,
    ) {
        if (policy.failureThreshold < 1 || policy.cooldownMs < 1) {
            throw new Error("Circuit-breaker policy values must be positive");
        }
    }

    tryAcquire(provider: string): { allowed: true; state: CircuitBreakerState } | {
        allowed: false;
        state: "OPEN" | "HALF_OPEN";
        retryAfterMs: number;
    } {
        const record = this.recordFor(provider);
        const timestamp = this.now();

        if (record.state === "OPEN") {
            const elapsed = timestamp - (record.openedAt ?? timestamp);
            if (elapsed < this.policy.cooldownMs) {
                return { allowed: false, state: "OPEN", retryAfterMs: this.policy.cooldownMs - elapsed };
            }
            record.state = "HALF_OPEN";
        }

        if (record.state === "HALF_OPEN") {
            if (record.probeInFlight) {
                return { allowed: false, state: "HALF_OPEN", retryAfterMs: 1 };
            }
            record.probeInFlight = true;
        }

        return { allowed: true, state: record.state };
    }

    recordSuccess(provider: string): void {
        this.records.set(provider, {
            state: "CLOSED",
            consecutiveFailures: 0,
            openedAt: null,
            probeInFlight: false,
        });
    }

    recordFailure(provider: string): void {
        const record = this.recordFor(provider);
        record.probeInFlight = false;
        record.consecutiveFailures += 1;

        if (record.state === "HALF_OPEN" || record.consecutiveFailures >= this.policy.failureThreshold) {
            record.state = "OPEN";
            record.openedAt = this.now();
        }
    }

    open(provider: string): void {
        const record = this.recordFor(provider);
        record.state = "OPEN";
        record.openedAt = this.now();
        record.probeInFlight = false;
    }

    state(provider: string): CircuitBreakerState {
        return this.recordFor(provider).state;
    }

    private recordFor(provider: string): CircuitRecord {
        const current = this.records.get(provider);
        if (current) return current;

        const created: CircuitRecord = {
            state: "CLOSED",
            consecutiveFailures: 0,
            openedAt: null,
            probeInFlight: false,
        };
        this.records.set(provider, created);
        return created;
    }
}

/** Adds per-provider rate limiting and circuit breaking around delivery sends. */
export class ResilientDeliveryProvider implements DeliveryProvider {
    constructor(
        private readonly providerName: string,
        private readonly provider: DeliveryProvider,
        private readonly rateLimiter: ProviderRateLimiter,
        private readonly circuitBreaker: ProviderCircuitBreaker,
        private readonly performanceMonitor?: ProviderPerformanceThresholdMonitor,
        private readonly now: () => number = Date.now,
    ) { }

    async send(notification: PreparedNotification): Promise<DeliveryResult> {
        const rateLimit = this.rateLimiter.tryAcquire(this.providerName);
        if (!rateLimit.allowed) {
            return {
                status: "FAILED",
                failureCode: "PROVIDER_RATE_LIMITED",
                failureReason: `Provider rate limit reached; retry after ${rateLimit.retryAfterMs}ms`,
                retryable: true,
                providerMetadata: { retryAfterMs: rateLimit.retryAfterMs },
            };
        }

        const circuit = this.circuitBreaker.tryAcquire(this.providerName);
        if (!circuit.allowed) {
            return {
                status: "FAILED",
                failureCode: "PROVIDER_CIRCUIT_OPEN",
                failureReason: `Provider circuit is ${circuit.state.toLowerCase()}`,
                retryable: true,
                providerMetadata: { retryAfterMs: circuit.retryAfterMs, circuitState: circuit.state },
            };
        }

        const startedAt = this.now();
        try {
            const result = await this.provider.send(notification);
            if (result.status === "FAILED") {
                this.circuitBreaker.recordFailure(this.providerName);
            } else {
                this.circuitBreaker.recordSuccess(this.providerName);
            }
            this.recordPerformance(result.status === "FAILED", this.now() - startedAt);
            return result;
        } catch (error) {
            this.circuitBreaker.recordFailure(this.providerName);
            this.recordPerformance(true, this.now() - startedAt);
            return {
                status: "FAILED",
                failureCode: "PROVIDER_UNEXPECTED_ERROR",
                failureReason: error instanceof Error ? error.message : "Provider threw an unknown error",
                retryable: true,
            };
        }
    }

    getStatus(externalId: string): Promise<DeliveryStatus> {
        return this.provider.getStatus(externalId);
    }

    validateRecipient(address: string): Promise<ValidationResult> {
        return this.provider.validateRecipient(address);
    }

    getQuota(): Promise<QuotaInfo> {
        return this.provider.getQuota();
    }

    private recordPerformance(failed: boolean, responseTimeMs: number): void {
        const assessment = this.performanceMonitor?.record(this.providerName, failed, responseTimeMs);
        if (assessment?.thresholdExceeded) {
            this.circuitBreaker.open(this.providerName);
        }
    }
}
