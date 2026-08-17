import { describe, expect, it } from "vitest";

import { createTestEvent } from "../factory";
import { FinancialEventSchema } from "../schemas";


// ============================================================
// All 25 official event types
// ============================================================

const eventTypes = [
    "TXNX-001",
    "TXNX-002",
    "TXNX-003",
    "TXNX-004",
    "TXNX-005",

    "RISK-001",
    "RISK-002",
    "RISK-003",
    "RISK-004",
    "RISK-005",

    "SIPX-001",
    "SIPX-002",
    "SIPX-003",
    "SIPX-004",
    "SIPX-005",

    "MKTX-001",
    "MKTX-002",
    "MKTX-003",
    "MKTX-004",
    "MKTX-005",

    "REGX-001",
    "REGX-002",
    "REGX-003",
    "REGX-004",
    "REGX-005",
] as const;


// ============================================================
// Valid event tests
// ============================================================

describe("Financial Event Validators", () => {

    describe("Valid events", () => {

        for (const eventType of eventTypes) {
            it(`accepts valid ${eventType} event`, () => {
                const event = createTestEvent(eventType);

                const result = FinancialEventSchema.safeParse(event);

                expect(result.success).toBe(true);
            });
        }

    });


    // ========================================================
    // Required field validation
    // ========================================================

    describe("Required field validation", () => {

        it("rejects event without eventId", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                eventId: "",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects event without userId", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                userId: "",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects invalid occurredAt", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                occurredAt: "not-a-date",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects invalid priority", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                priority: "URGENT",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });

    });


    // ========================================================
    // Discriminated union validation
    // ========================================================

    describe("Event type discrimination", () => {

        it("rejects TXNX-001 payload labeled as RISK-001", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                eventType: "RISK-001",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects TXNX-001 payload labeled as SIPX-001", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                eventType: "SIPX-001",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects unknown event type", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                eventType: "UNKNOWN-999",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });

    });


    // ========================================================
    // Category validation
    // ========================================================

    describe("Category validation", () => {

        it("rejects incorrect transaction category", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                eventCategory: "market_price",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects incorrect risk category", () => {
            const event = createTestEvent("RISK-001");

            const invalidEvent = {
                ...event,
                eventCategory: "transaction",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });

    });


    // ========================================================
    // Field type validation
    // ========================================================

    describe("Field type validation", () => {

        it("rejects invalid quantity for TXNX-001", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                quantity: "ten",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects negative price for TXNX-001", () => {
            const event = createTestEvent("TXNX-001");

            const invalidEvent = {
                ...event,
                price: -100,
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects invalid direction for MKTX-001", () => {
            const event = createTestEvent("MKTX-001");

            const invalidEvent = {
                ...event,
                direction: "SIDEWAYS",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects allocation above 100 percent", () => {
            const event = createTestEvent("RISK-005");

            const invalidEvent = {
                ...event,
                allocationPercentage: 150,
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects negative SIP amount", () => {
            const event = createTestEvent("SIPX-001");

            const invalidEvent = {
                ...event,
                amount: -5000,
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects milestone percentage above 100", () => {
            const event = createTestEvent("SIPX-005");

            const invalidEvent = {
                ...event,
                percentageComplete: 150,
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects empty required string", () => {
            const event = createTestEvent("REGX-001");

            const invalidEvent = {
                ...event,
                submissionLink: "",
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("rejects empty required array", () => {
            const event = createTestEvent("REGX-001");

            const invalidEvent = {
                ...event,
                documentsNeeded: [],
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });

    });


    // ========================================================
    // Nested / collection field validation
    // ========================================================

    describe("Collection validation", () => {

        it("accepts valid index levels", () => {
            const event = createTestEvent("MKTX-003");

            const result =
                FinancialEventSchema.safeParse(event);

            expect(result.success).toBe(true);
        });


        it("rejects invalid index level value", () => {
            const event = createTestEvent("MKTX-003");

            const invalidEvent = {
                ...event,
                indexLevels: {
                    NIFTY50: "24500",
                },
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });


        it("accepts valid key figures", () => {
            const event = createTestEvent("REGX-004");

            const result =
                FinancialEventSchema.safeParse(event);

            expect(result.success).toBe(true);
        });


        it("rejects invalid key figure value", () => {
            const event = createTestEvent("REGX-004");

            const invalidEvent = {
                ...event,
                keyFigures: {
                    totalCapitalGains: "125000",
                },
            };

            const result =
                FinancialEventSchema.safeParse(invalidEvent);

            expect(result.success).toBe(false);
        });

    });

});