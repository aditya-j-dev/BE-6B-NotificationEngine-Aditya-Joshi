import type { QuietHoursDecision } from "./quiet-hours";

export interface QuietHoursQueueItem {
    notificationId: string;
    eventId: string;
    eventType: string;
    content: string;
    deferredAt: string;
}

export interface QuietHoursQueueRequest {
    userId: string;
    timezone: string;
    item: QuietHoursQueueItem;
}

export interface MorningQuietHoursDigest {
    userId: string;
    timezone: string;
    scheduledFor: string;
    items: QuietHoursQueueItem[];
}

export interface RedisQuietHoursClient {
    rpush(key: string, ...values: string[]): Promise<number>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    del(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    sadd(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
}

export class QuietHoursQueueError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "QuietHoursQueueError";
    }
}

/** Aggregates quiet-hours notifications into a user's next local-morning digest. */
export class QuietHoursQueueService {
    constructor(
        private readonly redis: RedisQuietHoursClient,
        private readonly morningTime = "08:00",
        private readonly retentionSeconds = 172800,
    ) { }

    async enqueue(
        request: QuietHoursQueueRequest,
        decision: QuietHoursDecision,
    ): Promise<{ scheduledFor: string }> {
        if (decision.status !== "DEFER_UNTIL_QUIET_HOURS_END") {
            throw new QuietHoursQueueError(
                "Only a quiet-hours deferral can be added to the morning queue",
            );
        }

        const scheduledFor = this.nextMorning(
            new Date(decision.resumeAt),
            request.timezone,
        );
        const itemKey = this.itemKey(request.userId, scheduledFor);
        const indexKey = this.indexKey(scheduledFor);

        await this.redis.rpush(itemKey, JSON.stringify(request.item));
        await this.redis.sadd(indexKey, request.userId);
        await Promise.all([
            this.redis.expire(itemKey, this.retentionSeconds),
            this.redis.expire(indexKey, this.retentionSeconds),
        ]);

        return { scheduledFor: scheduledFor.toISOString() };
    }

    async drain(
        scheduledFor: Date,
        timezoneByUser: Record<string, string>,
    ): Promise<MorningQuietHoursDigest[]> {
        const users = await this.redis.smembers(this.indexKey(scheduledFor));
        const digests = await Promise.all(users.map(async (userId) => {
            const timezone = timezoneByUser[userId];
            // Keep queued entries intact until a valid timezone is available.
            if (!timezone) {
                return null;
            }

            const serializedItems = await this.redis.lrange(
                this.itemKey(userId, scheduledFor),
                0,
                -1,
            );
            await this.redis.del(this.itemKey(userId, scheduledFor));
            const items = serializedItems.flatMap((serializedItem) => {
                try {
                    return [JSON.parse(serializedItem) as QuietHoursQueueItem];
                } catch {
                    return [];
                }
            }).sort((left, right) => left.deferredAt.localeCompare(right.deferredAt));

            if (items.length === 0) {
                return null;
            }

            return {
                userId,
                timezone,
                scheduledFor: scheduledFor.toISOString(),
                items,
            } satisfies MorningQuietHoursDigest;
        }));

        return digests.filter((digest): digest is MorningQuietHoursDigest => digest !== null);
    }

    private nextMorning(after: Date, timezone: string): Date {
        const targetMinutes = this.toMinutes(this.morningTime);
        let candidate = new Date(after.getTime());
        candidate.setUTCSeconds(0, 0);

        for (let minute = 0; minute <= 2880; minute += 1) {
            if (this.localMinutes(candidate, timezone) === targetMinutes) {
                return candidate;
            }

            candidate = new Date(candidate.getTime() + 60_000);
        }

        throw new QuietHoursQueueError("Could not find the next local morning window");
    }

    private localMinutes(timestamp: Date, timezone: string): number {
        const parts = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            timeZone: timezone,
        }).formatToParts(timestamp);
        const hours = Number(parts.find(({ type }) => type === "hour")?.value);
        const minutes = Number(parts.find(({ type }) => type === "minute")?.value);

        return (hours * 60) + minutes;
    }

    private toMinutes(value: string): number {
        const match = /^(\d{2}):(\d{2})$/.exec(value);
        const hours = Number(match?.[1]);
        const minutes = Number(match?.[2]);

        if (!match || hours > 23 || minutes > 59) {
            throw new QuietHoursQueueError("Morning digest time must use HH:MM in 24-hour time");
        }

        return (hours * 60) + minutes;
    }

    private itemKey(userId: string, scheduledFor: Date): string {
        return [
            "notification:quiet-hours:items",
            scheduledFor.toISOString(),
            userId,
        ].join(":");
    }

    private indexKey(scheduledFor: Date): string {
        return ["notification:quiet-hours:index", scheduledFor.toISOString()].join(":");
    }
}
