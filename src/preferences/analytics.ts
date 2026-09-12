import type { PreferenceInput, UserPreferenceRecord } from "./types";

export type PreferenceChangeField =
    | "created"
    | "enabled"
    | "quietHoursOverride"
    | "digestMode"
    | "priorityOverride";

export interface PreferenceChange {
    field: PreferenceChangeField;
    eventCategory: PreferenceInput["eventCategory"];
    eventType: string;
    channel: PreferenceInput["channel"];
}

export interface PreferenceAnalytics {
    record(changes: PreferenceChange[]): Promise<void>;
}

export interface RedisPreferenceAnalyticsClient {
    zincrby(key: string, increment: number, member: string): Promise<string>;
    zrevrange(
        key: string,
        start: number,
        stop: number,
        withScores: "WITHSCORES",
    ): Promise<string[]>;
}

export interface PreferenceChangeMetric {
    name: string;
    count: number;
}

const fieldMetricsKey = "notification:analytics:preferences:fields";
const targetMetricsKey = "notification:analytics:preferences:targets";

/** Redis-backed rankings for the preference settings users change most. */
export class RedisPreferenceAnalytics implements PreferenceAnalytics {
    constructor(private readonly redis: RedisPreferenceAnalyticsClient) { }

    async record(changes: PreferenceChange[]): Promise<void> {
        await Promise.all(changes.flatMap((change) => [
            this.redis.zincrby(fieldMetricsKey, 1, change.field),
            this.redis.zincrby(targetMetricsKey, 1, this.targetName(change)),
        ]));
    }

    async mostChangedFields(limit = 10): Promise<PreferenceChangeMetric[]> {
        return this.readRanking(fieldMetricsKey, limit);
    }

    async mostChangedTargets(limit = 10): Promise<PreferenceChangeMetric[]> {
        return this.readRanking(targetMetricsKey, limit);
    }

    private async readRanking(
        key: string,
        limit: number,
    ): Promise<PreferenceChangeMetric[]> {
        if (limit <= 0) {
            return [];
        }

        const values = await this.redis.zrevrange(
            key,
            0,
            limit - 1,
            "WITHSCORES",
        );
        const metrics: PreferenceChangeMetric[] = [];

        for (let index = 0; index < values.length; index += 2) {
            const name = values[index];
            const count = values[index + 1];

            if (name !== undefined && count !== undefined) {
                metrics.push({ name, count: Number(count) });
            }
        }

        return metrics;
    }

    private targetName(change: PreferenceChange): string {
        return [
            change.eventCategory,
            change.eventType,
            change.channel,
            change.field,
        ].join(":");
    }
}

export function preferenceChanges(
    previous: UserPreferenceRecord | null,
    next: UserPreferenceRecord,
): PreferenceChange[] {
    const base = {
        eventCategory: next.eventCategory,
        eventType: next.eventType,
        channel: next.channel,
    };

    if (!previous) {
        return [{ ...base, field: "created" }];
    }

    const fields: Array<Exclude<PreferenceChangeField, "created">> = [
        "enabled",
        "quietHoursOverride",
        "digestMode",
        "priorityOverride",
    ];

    return fields.flatMap((field) => previous[field] === next[field]
        ? []
        : [{ ...base, field }],
    );
}
