import type { IncomingMessage, ServerResponse } from "node:http";

interface RateLimitBucket {
    count: number;
    resetAt: number;
}

export interface ApiRateLimiterOptions {
    maxRequests?: number;
    windowMs?: number;
    now?: () => number;
}

function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value ?? fallback);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Fixed-window limiter for every public HTTP endpoint; use a shared store when horizontally scaling. */
export class ApiRateLimiter {
    private readonly buckets = new Map<string, RateLimitBucket>();
    readonly maxRequests: number;
    private readonly windowMs: number;
    private readonly now: () => number;

    constructor(options: ApiRateLimiterOptions = {}) {
        this.maxRequests = options.maxRequests ?? positiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 120);
        this.windowMs = options.windowMs ?? positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
        this.now = options.now ?? Date.now;
    }

    allow(request: IncomingMessage): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
        const now = this.now();
        const key = this.clientKey(request);
        for (const [bucketKey, bucket] of this.buckets) {
            if (bucket.resetAt <= now) this.buckets.delete(bucketKey);
        }
        const current = this.buckets.get(key);
        const bucket = !current || current.resetAt <= now
            ? { count: 0, resetAt: now + this.windowMs }
            : current;
        bucket.count += 1;
        this.buckets.set(key, bucket);
        return {
            allowed: bucket.count <= this.maxRequests,
            remaining: Math.max(0, this.maxRequests - bucket.count),
            retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
        };
    }

    private clientKey(request: IncomingMessage): string {
        const forwarded = request.headers["x-forwarded-for"];
        const address = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined;
        return address || request.socket.remoteAddress || "unknown";
    }
}

export function applyRateLimit(request: IncomingMessage, response: ServerResponse, limiter: ApiRateLimiter): boolean {
    const result = limiter.allow(request);
    response.setHeader("x-ratelimit-limit", limiter.maxRequests);
    response.setHeader("x-ratelimit-remaining", result.remaining);
    if (result.allowed) return true;
    response.writeHead(429, { "content-type": "application/json; charset=utf-8", "retry-after": String(result.retryAfterSeconds) });
    response.end(JSON.stringify({ error: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds }));
    return false;
}
