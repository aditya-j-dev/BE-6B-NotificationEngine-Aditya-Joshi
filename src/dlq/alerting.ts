export interface DlqDepthStore {
    deadLetterQueue: {
        count(args: { where: { resolved: false } }): Promise<number>;
    };
}

export interface DlqDepthAlert {
    depth: number;
    threshold: number;
    observedAt: string;
    severity: "WARNING" | "CRITICAL";
}

export interface OperationsAlerter {
    send(alert: DlqDepthAlert): Promise<void>;
}

export interface DlqAlertSuppressionStore {
    claim(key: string, ttlSeconds: number): Promise<boolean>;
    release(key: string): Promise<void>;
}

export interface RedisDlqAlertSuppressionClient {
    set(key: string, value: string, mode: "EX", ttlSeconds: number, condition: "NX"): Promise<"OK" | null>;
    del(key: string): Promise<number>;
}

/** Redis NX suppression prevents repeated alerts while the same threshold breach persists. */
export class RedisDlqAlertSuppressionStore implements DlqAlertSuppressionStore {
    constructor(private readonly redis: RedisDlqAlertSuppressionClient) { }

    async claim(key: string, ttlSeconds: number): Promise<boolean> {
        return (await this.redis.set(key, "1", "EX", ttlSeconds, "NX")) === "OK";
    }

    async release(key: string): Promise<void> {
        await this.redis.del(key);
    }
}

export interface DlqAlertPolicy {
    depthThreshold: number;
    criticalMultiplier: number;
    cooldownSeconds: number;
}

export const DEFAULT_DLQ_ALERT_POLICY: DlqAlertPolicy = {
    depthThreshold: 100,
    criticalMultiplier: 2,
    cooldownSeconds: 300,
};

export type DlqDepthAlertResult =
    | { outcome: "HEALTHY"; depth: number }
    | { outcome: "ALERT_SENT"; alert: DlqDepthAlert }
    | { outcome: "ALERT_SUPPRESSED"; alert: DlqDepthAlert };

/** Monitors unresolved DLQ depth and alerts operations after a threshold breach. */
export class DlqDepthAlertService {
    private readonly suppressionKey = "notification:dlq:alert:depth";

    constructor(
        private readonly store: DlqDepthStore,
        private readonly alerter: OperationsAlerter,
        private readonly suppression: DlqAlertSuppressionStore,
        private readonly policy: DlqAlertPolicy = DEFAULT_DLQ_ALERT_POLICY,
        private readonly now: () => Date = () => new Date(),
    ) {
        if (
            !Number.isInteger(policy.depthThreshold) || policy.depthThreshold < 1
            || policy.criticalMultiplier < 1
            || !Number.isInteger(policy.cooldownSeconds) || policy.cooldownSeconds < 1
        ) {
            throw new Error("Invalid DLQ alert policy");
        }
    }

    async evaluate(): Promise<DlqDepthAlertResult> {
        const depth = await this.store.deadLetterQueue.count({ where: { resolved: false } });
        if (depth < this.policy.depthThreshold) {
            await this.suppression.release(this.suppressionKey);
            return { outcome: "HEALTHY", depth };
        }

        const alert: DlqDepthAlert = {
            depth,
            threshold: this.policy.depthThreshold,
            observedAt: this.now().toISOString(),
            severity: depth >= this.policy.depthThreshold * this.policy.criticalMultiplier
                ? "CRITICAL"
                : "WARNING",
        };
        const claimed = await this.suppression.claim(this.suppressionKey, this.policy.cooldownSeconds);
        if (!claimed) return { outcome: "ALERT_SUPPRESSED", alert };

        try {
            await this.alerter.send(alert);
            return { outcome: "ALERT_SENT", alert };
        } catch (error) {
            await this.suppression.release(this.suppressionKey);
            throw error;
        }
    }
}

function positiveIntegerFromEnvironment(
    value: string | undefined,
    fallback: number,
    name: string,
): number {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
}

/** Builds a DLQ alert service with its policy loaded from the configured environment. */
export function createDlqDepthAlertServiceFromEnv(
    store: DlqDepthStore,
    alerter: OperationsAlerter,
    redis: RedisDlqAlertSuppressionClient,
    environment: NodeJS.ProcessEnv = process.env,
): DlqDepthAlertService {
    return new DlqDepthAlertService(
        store,
        alerter,
        new RedisDlqAlertSuppressionStore(redis),
        {
            depthThreshold: positiveIntegerFromEnvironment(
                environment.DLQ_ALERT_THRESHOLD,
                DEFAULT_DLQ_ALERT_POLICY.depthThreshold,
                "DLQ_ALERT_THRESHOLD",
            ),
            criticalMultiplier: DEFAULT_DLQ_ALERT_POLICY.criticalMultiplier,
            cooldownSeconds: DEFAULT_DLQ_ALERT_POLICY.cooldownSeconds,
        },
    );
}

/** Builds the complete SMTP-email DLQ alert service from the configured environment. */
export function createDlqDepthEmailAlertServiceFromEnv(
    store: DlqDepthStore,
    redis: RedisDlqAlertSuppressionClient,
    environment: NodeJS.ProcessEnv = process.env,
): DlqDepthAlertService {
    return createDlqDepthAlertServiceFromEnv(
        store,
        createEmailOperationsAlerterFromEnv(environment),
        redis,
        environment,
    );
}
import { createEmailOperationsAlerterFromEnv } from "./email-alert";
