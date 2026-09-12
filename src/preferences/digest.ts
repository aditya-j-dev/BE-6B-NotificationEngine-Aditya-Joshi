import type { EventPriority } from "../events/types";

import type { PreferenceInput } from "./types";

export interface DigestItem {
    eventId: string;
    eventType: string;
    occurredAt: string;
    summary: string;
}

export interface DigestRequest {
    userId: string;
    digestMode: PreferenceInput["digestMode"];
    priority: EventPriority;
    item: DigestItem;
}

export interface NotificationDigest {
    userId: string;
    mode: Exclude<PreferenceInput["digestMode"], "immediate">;
    scheduledFor: string;
    items: DigestItem[];
}

export type DigestQueueResult =
    | { action: "DELIVER_IMMEDIATELY" }
    | { action: "QUEUED_FOR_DIGEST"; scheduledFor: string };

export interface RedisDigestClient {
    rpush(key: string, ...values: string[]): Promise<number>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    del(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    sadd(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
}

const DIGEST_ELIGIBLE_PRIORITIES = new Set<EventPriority>([
    "NORMAL",
    "LOW",
    "VERY_LOW",
]);

/** Batches low-priority notifications by user and delivery window in Redis. */
export class DigestService {
    constructor(
        private readonly redis: RedisDigestClient,
        private readonly retentionSeconds = 172800,
    ) { }

    async queue(
        request: DigestRequest,
        now = new Date(),
    ): Promise<DigestQueueResult> {
        if (
            request.digestMode === "immediate" ||
            !DIGEST_ELIGIBLE_PRIORITIES.has(request.priority)
        ) {
            return { action: "DELIVER_IMMEDIATELY" };
        }

        const scheduledFor = this.nextDeliveryWindow(request.digestMode, now);
        const serializedItem = JSON.stringify(request.item);
        const itemKey = this.itemKey(
            request.userId,
            request.digestMode,
            scheduledFor,
        );
        const indexKey = this.indexKey(request.digestMode, scheduledFor);

        await this.redis.rpush(itemKey, serializedItem);
        await this.redis.sadd(indexKey, request.userId);
        await Promise.all([
            this.redis.expire(itemKey, this.retentionSeconds),
            this.redis.expire(indexKey, this.retentionSeconds),
        ]);

        return {
            action: "QUEUED_FOR_DIGEST",
            scheduledFor: scheduledFor.toISOString(),
        };
    }

    async drain(
        mode: Exclude<PreferenceInput["digestMode"], "immediate">,
        scheduledFor: Date,
    ): Promise<NotificationDigest[]> {
        const users = await this.redis.smembers(this.indexKey(mode, scheduledFor));
        const digests = await Promise.all(users.map(async (userId) => {
            const key = this.itemKey(userId, mode, scheduledFor);
            const serializedItems = await this.redis.lrange(key, 0, -1);
            await this.redis.del(key);
            const items = serializedItems.flatMap((serializedItem) => {
                try {
                    return [JSON.parse(serializedItem) as DigestItem];
                } catch {
                    return [];
                }
            }).sort((left, right) =>
                left.occurredAt.localeCompare(right.occurredAt),
            );

            if (items.length === 0) {
                return null;
            }

            return {
                userId,
                mode,
                scheduledFor: scheduledFor.toISOString(),
                items,
            } satisfies NotificationDigest;
        }));

        return digests.filter((digest): digest is NotificationDigest => digest !== null);
    }

    private nextDeliveryWindow(
        mode: Exclude<PreferenceInput["digestMode"], "immediate">,
        now: Date,
    ): Date {
        const scheduledFor = new Date(now);

        if (mode === "hourly") {
            scheduledFor.setUTCMinutes(0, 0, 0);
            scheduledFor.setUTCHours(scheduledFor.getUTCHours() + 1);
            return scheduledFor;
        }

        scheduledFor.setUTCHours(0, 0, 0, 0);
        scheduledFor.setUTCDate(scheduledFor.getUTCDate() + 1);
        return scheduledFor;
    }

    private itemKey(
        userId: string,
        mode: Exclude<PreferenceInput["digestMode"], "immediate">,
        scheduledFor: Date,
    ): string {
        return [
            "notification:digest:items",
            mode,
            scheduledFor.toISOString(),
            userId,
        ].join(":");
    }

    private indexKey(
        mode: Exclude<PreferenceInput["digestMode"], "immediate">,
        scheduledFor: Date,
    ): string {
        return ["notification:digest:index", mode, scheduledFor.toISOString()].join(":");
    }
}
