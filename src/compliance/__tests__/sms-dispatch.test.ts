import { describe, expect, it } from "vitest";

import {
    SmsDispatchComplianceGate,
    type DndLookup,
    type SmsDispatchRequest,
    type SmsProvider,
} from "../index";

const request: SmsDispatchRequest = {
    notificationId: "notification-1",
    userId: "user-1",
    phone: "+919876543210",
    content: "Your price alert was triggered.",
    classification: "PROMOTIONAL",
};

function createGate(
    registered: boolean,
    sequence: string[],
): SmsDispatchComplianceGate {
    const dndLookup: DndLookup = {
        lookup: async (phone) => {
            sequence.push("DND_LOOKUP");
            return { phone, registered, source: "REGISTRY" };
        },
    };
    const provider: SmsProvider = {
        send: async () => {
            sequence.push("PROVIDER_SEND");
            return { providerMessageId: "provider-1" };
        },
    };

    return new SmsDispatchComplianceGate(dndLookup, provider);
}

describe("SmsDispatchComplianceGate", () => {
    it("checks DND immediately before sending an allowed promotional SMS", async () => {
        const sequence: string[] = [];
        const gate = createGate(false, sequence);

        await expect(gate.dispatch(request)).resolves.toMatchObject({
            status: "SENT",
            providerMessageId: "provider-1",
            dndCheck: { source: "REGISTRY", registered: false },
        });
        expect(sequence).toEqual(["DND_LOOKUP", "PROVIDER_SEND"]);
    });

    it("blocks a promotional SMS for a DND-registered recipient", async () => {
        const sequence: string[] = [];
        const gate = createGate(true, sequence);

        await expect(gate.dispatch(request)).resolves.toMatchObject({
            status: "BLOCKED_DND",
            dndCheck: { registered: true },
        });
        expect(sequence).toEqual(["DND_LOOKUP"]);
    });

    it("still performs the final DND check for a transactional SMS", async () => {
        const sequence: string[] = [];
        const gate = createGate(true, sequence);

        await expect(gate.dispatch({
            ...request,
            classification: "TRANSACTIONAL",
        })).resolves.toMatchObject({ status: "SENT" });
        expect(sequence).toEqual(["DND_LOOKUP", "PROVIDER_SEND"]);
    });

    it("does not send if the final DND lookup fails", async () => {
        const provider: SmsProvider = {
            send: async () => {
                throw new Error("Provider should not be called");
            },
        };
        const dndLookup: DndLookup = {
            lookup: async () => {
                throw new Error("DND registry unavailable");
            },
        };
        const gate = new SmsDispatchComplianceGate(dndLookup, provider);

        await expect(gate.dispatch(request))
            .rejects.toThrow("DND registry unavailable");
    });
});
