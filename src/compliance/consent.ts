import type { ConsentType } from "../generated/prisma/enums";

export type ConsentAction = "OPT_IN" | "OPT_OUT";

export interface ConsentRecordInput {
    userId: string;
    consentType: ConsentType;
    granted: boolean;
    source?: string;
    grantedAt?: Date;
    revokedAt?: Date;
}

export interface ConsentRecordSnapshot extends ConsentRecordInput {
    id: string;
}

export interface ConsentAuditEntry {
    userId: string;
    consentType: ConsentType;
    previousGranted: boolean | null;
    granted: boolean;
    source?: string;
    action: ConsentAction;
}

interface ConsentTransaction {
    user: {
        findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null>;
    };
    consentRecord: {
        findFirst(args: {
            where: { userId: string; consentType: ConsentType };
            orderBy: { createdAt: "desc" };
        }): Promise<ConsentRecordSnapshot | null>;
        create(args: { data: ConsentRecordInput }): Promise<ConsentRecordSnapshot>;
    };
    consentAuditLog: {
        create(args: { data: ConsentAuditEntry }): Promise<ConsentAuditEntry>;
    };
}

export interface ConsentStore extends ConsentTransaction {
    $transaction<T>(
        operation: (transaction: ConsentTransaction) => Promise<T>,
    ): Promise<T>;
}

export class ConsentUserNotFoundError extends Error {
    constructor(readonly userId: string) {
        super(`User ${userId} was not found`);
        this.name = "ConsentUserNotFoundError";
    }
}

export class ConsentService {
    constructor(private readonly store: ConsentStore) { }

    async record(
        input: ConsentRecordInput,
    ): Promise<ConsentRecordSnapshot> {
        return this.store.$transaction(async (transaction) => {
            const user = await transaction.user.findUnique({
                where: { id: input.userId },
                select: { id: true },
            });

            if (!user) {
                throw new ConsentUserNotFoundError(input.userId);
            }

            const previous = await transaction.consentRecord.findFirst({
                where: {
                    userId: input.userId,
                    consentType: input.consentType,
                },
                orderBy: { createdAt: "desc" },
            });
            const recordedAt = new Date();
            const record = await transaction.consentRecord.create({
                data: {
                    ...input,
                    grantedAt: input.granted ? recordedAt : undefined,
                    revokedAt: input.granted ? undefined : recordedAt,
                },
            });

            await transaction.consentAuditLog.create({
                data: {
                    userId: input.userId,
                    consentType: input.consentType,
                    previousGranted: previous?.granted ?? null,
                    granted: input.granted,
                    source: input.source,
                    action: input.granted ? "OPT_IN" : "OPT_OUT",
                },
            });

            return record;
        });
    }
}
