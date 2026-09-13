import { describe, expect, it } from "vitest";

import {
    ConsentService,
    ConsentUserNotFoundError,
    type ConsentAuditEntry,
    type ConsentRecordInput,
    type ConsentRecordSnapshot,
    type ConsentStore,
} from "../index";

function createStore(userExists = true) {
    const records: ConsentRecordSnapshot[] = [];
    const auditEntries: ConsentAuditEntry[] = [];
    const transaction = {
        user: {
            findUnique: async () => userExists ? { id: "user-1" } : null,
        },
        consentRecord: {
            findFirst: async ({ where }: {
                where: { userId: string; consentType: ConsentRecordInput["consentType"] };
            }) => [...records].reverse().find((record) =>
                record.userId === where.userId && record.consentType === where.consentType,
            ) ?? null,
            create: async ({ data }: { data: ConsentRecordInput }) => {
                const record = { id: `consent-${records.length + 1}`, ...data };
                records.push(record);
                return record;
            },
        },
        consentAuditLog: {
            create: async ({ data }: { data: ConsentAuditEntry }) => {
                auditEntries.push(data);
                return data;
            },
        },
    };

    return {
        store: {
            ...transaction,
            $transaction: async <T>(operation: (value: typeof transaction) => Promise<T>) =>
                operation(transaction),
        } as ConsentStore,
        records,
        auditEntries,
    };
}

function consentInput(granted: boolean): ConsentRecordInput {
    return {
        userId: "user-1",
        consentType: "PROMOTIONAL",
        granted,
        source: "PROFILE_SETTINGS",
    };
}

describe("ConsentService", () => {
    it("records an opt-in and an immutable audit event", async () => {
        const fixture = createStore();
        const service = new ConsentService(fixture.store);

        const record = await service.record(consentInput(true));

        expect(record).toMatchObject({ granted: true, source: "PROFILE_SETTINGS" });
        expect(record.grantedAt).toBeInstanceOf(Date);
        expect(fixture.auditEntries).toEqual([{
            userId: "user-1",
            consentType: "PROMOTIONAL",
            previousGranted: null,
            granted: true,
            source: "PROFILE_SETTINGS",
            action: "OPT_IN",
        }]);
    });

    it("records an opt-out with the previous consent state", async () => {
        const fixture = createStore();
        const service = new ConsentService(fixture.store);

        await service.record(consentInput(true));
        const record = await service.record(consentInput(false));

        expect(record.revokedAt).toBeInstanceOf(Date);
        expect(fixture.auditEntries[1]).toMatchObject({
            previousGranted: true,
            granted: false,
            action: "OPT_OUT",
        });
    });

    it("keeps a historical consent record for every decision", async () => {
        const fixture = createStore();
        const service = new ConsentService(fixture.store);

        await service.record(consentInput(true));
        await service.record(consentInput(false));

        expect(fixture.records).toHaveLength(2);
        expect(fixture.auditEntries).toHaveLength(2);
    });

    it("does not record consent for an unknown user", async () => {
        const fixture = createStore(false);
        const service = new ConsentService(fixture.store);

        await expect(service.record(consentInput(true)))
            .rejects.toBeInstanceOf(ConsentUserNotFoundError);
        expect(fixture.records).toEqual([]);
        expect(fixture.auditEntries).toEqual([]);
    });
});
