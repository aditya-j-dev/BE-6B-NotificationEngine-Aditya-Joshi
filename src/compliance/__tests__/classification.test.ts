import { describe, expect, it } from "vitest";

import { createTestEvent } from "../../events/factory";
import type { FinancialEvent } from "../../events/types";
import {
    EVENT_CLASSIFICATIONS,
    NotificationClassificationEngine,
} from "../index";

describe("NotificationClassificationEngine", () => {
    const engine = new NotificationClassificationEngine();

    it("defines a classification for all 25 financial event types", () => {
        expect(Object.keys(EVENT_CLASSIFICATIONS)).toHaveLength(25);
    });

    it("classifies transaction confirmations and account-safety alerts as transactional", () => {
        expect(engine.classify({ event: createTestEvent("TXNX-001") }))
            .toMatchObject({ classification: "TRANSACTIONAL" });
        expect(engine.classify({ event: createTestEvent("RISK-002") }))
            .toMatchObject({ classification: "TRANSACTIONAL" });
        expect(engine.classify({ event: createTestEvent("REGX-001") }))
            .toMatchObject({ classification: "TRANSACTIONAL" });
    });

    it("keeps a user-configured price alert transactional", () => {
        expect(engine.classify({ event: createTestEvent("MKTX-001") }))
            .toEqual({
                classification: "TRANSACTIONAL",
                reason: "CUSTOMER_REQUESTED_ALERT",
            });
    });

    it("classifies investment nudges and general market content as promotional", () => {
        const promotionalEvents: FinancialEvent["eventType"][] = [
            "SIPX-004",
            "MKTX-003",
            "MKTX-004",
            "MKTX-005",
        ];

        promotionalEvents.forEach((eventType) => {
            expect(engine.classify({ event: createTestEvent(eventType) }))
                .toMatchObject({ classification: "PROMOTIONAL" });
        });
    });

    it("treats promotional content as promotional regardless of event type", () => {
        expect(engine.classify({
            event: createTestEvent("TXNX-001"),
            containsPromotionalContent: true,
        })).toEqual({
            classification: "PROMOTIONAL",
            reason: "PROMOTIONAL_CONTENT_OVERRIDE",
        });
    });
});
