import type { DlqFailureClassification } from "./classifier";

export interface DlqDashboardEntry {
    id: string;
    notificationId: string;
    notificationCreatedAt: Date;
    failureReason: string;
    retryCount: number;
    lastError: string | null;
    resolved: boolean;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    resolutionAction: string | null;
    classification: DlqFailureClassification | null;
    createdAt: Date;
}

export interface DlqListQuery {
    reason?: string;
    includeResolved?: boolean;
    limit?: number;
    offset?: number;
}

export interface DlqListResult {
    entries: DlqDashboardEntry[];
    total: number;
    limit: number;
    offset: number;
}

type ResolutionAction = "RETRY" | "DISCARD";

interface DlqDashboardTransaction {
    deadLetterQueue: {
        findMany(args: {
            where: { resolved?: boolean; failureReason?: { contains: string; mode: "insensitive" } };
            orderBy: { createdAt: "desc" };
            take: number;
            skip: number;
        }): Promise<DlqDashboardEntry[]>;
        count(args: { where: { resolved?: boolean; failureReason?: { contains: string; mode: "insensitive" } } }): Promise<number>;
        findUnique(args: { where: { id: string } }): Promise<DlqDashboardEntry | null>;
        update(args: {
            where: { id: string };
            data: { resolved: true; resolvedBy: string; resolvedAt: Date; resolutionAction: ResolutionAction };
        }): Promise<DlqDashboardEntry>;
    };
    notification: {
        update(args: {
            where: { id_createdAt: { id: string; createdAt: Date } };
            data: { status: "QUEUED" | "FAILED"; nextRetryAt: Date | null; failedReason: string | null };
        }): Promise<unknown>;
    };
    notificationStateLog: {
        create(args: {
            data: {
                notificationId: string;
                notificationCreatedAt: Date;
                fromStatus: "DLQ";
                toStatus: "QUEUED" | "FAILED";
                actor: string;
                metadata: { dlqEntryId: string; resolutionAction: ResolutionAction };
            };
        }): Promise<unknown>;
    };
}

export interface DlqDashboardStore extends DlqDashboardTransaction {
    $transaction<T>(operation: (transaction: DlqDashboardTransaction) => Promise<T>): Promise<T>;
}

export class DlqEntryNotFoundError extends Error {
    constructor(entryId: string) {
        super(`DLQ entry ${entryId} was not found`);
        this.name = "DlqEntryNotFoundError";
    }
}

export class DlqEntryResolvedError extends Error {
    constructor(entryId: string) {
        super(`DLQ entry ${entryId} has already been resolved`);
        this.name = "DlqEntryResolvedError";
    }
}

/** Lists and manually resolves DLQ entries while recording every operator action. */
export class DeadLetterQueueDashboardService {
    constructor(private readonly store: DlqDashboardStore, private readonly now: () => Date = () => new Date()) { }

    async list(query: DlqListQuery = {}): Promise<DlqListResult> {
        const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(query.limit ?? 50, 100)) : 50;
        const offset = Number.isInteger(query.offset) ? Math.max(0, query.offset ?? 0) : 0;
        const where = {
            ...(query.includeResolved ? {} : { resolved: false }),
            ...(query.reason?.trim()
                ? { failureReason: { contains: query.reason.trim(), mode: "insensitive" as const } }
                : {}),
        };
        const [entries, total] = await Promise.all([
            this.store.deadLetterQueue.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
            this.store.deadLetterQueue.count({ where }),
        ]);
        return { entries, total, limit, offset };
    }

    retry(entryId: string, actor: string): Promise<DlqDashboardEntry> {
        return this.resolve(entryId, actor, "RETRY");
    }

    discard(entryId: string, actor: string): Promise<DlqDashboardEntry> {
        return this.resolve(entryId, actor, "DISCARD");
    }

    private async resolve(
        entryId: string,
        actor: string,
        action: ResolutionAction,
    ): Promise<DlqDashboardEntry> {
        return this.store.$transaction(async (transaction) => {
            const entry = await transaction.deadLetterQueue.findUnique({ where: { id: entryId } });
            if (!entry) throw new DlqEntryNotFoundError(entryId);
            if (entry.resolved) throw new DlqEntryResolvedError(entryId);

            const resolutionTime = this.now();
            const notificationUpdate = action === "RETRY"
                ? { status: "QUEUED" as const, nextRetryAt: resolutionTime, failedReason: null }
                : { status: "FAILED" as const, nextRetryAt: null, failedReason: entry.lastError ?? entry.failureReason };
            const updated = await transaction.deadLetterQueue.update({
                where: { id: entry.id },
                data: {
                    resolved: true,
                    resolvedBy: actor,
                    resolvedAt: resolutionTime,
                    resolutionAction: action,
                },
            });
            await transaction.notification.update({
                where: {
                    id_createdAt: {
                        id: entry.notificationId,
                        createdAt: entry.notificationCreatedAt,
                    },
                },
                data: notificationUpdate,
            });
            await transaction.notificationStateLog.create({
                data: {
                    notificationId: entry.notificationId,
                    notificationCreatedAt: entry.notificationCreatedAt,
                    fromStatus: "DLQ",
                    toStatus: notificationUpdate.status,
                    actor: `dlq-dashboard:${actor}`,
                    metadata: { dlqEntryId: entry.id, resolutionAction: action },
                },
            });
            return updated;
        });
    }
}
