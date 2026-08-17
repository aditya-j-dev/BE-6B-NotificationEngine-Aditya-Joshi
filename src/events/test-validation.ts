import { FinancialEventSchema } from "./schemas";

const validEvent = {
    eventId: "evt-001",
    eventType: "TXNX-001",
    eventCategory: "transaction",
    userId: "user-001",
    occurredAt: "2026-08-16T10:00:00.000Z",
    correlationId: "corr-001",
    source: "trading-service",
    priority: "HIGH",

    stockName: "RELIANCE",
    quantity: 10,
    price: 2500,
    total: 25000,
    portfolioImpact: 25000,
};

const result = FinancialEventSchema.safeParse(validEvent);

console.log("Valid event:", result.success);

if (!result.success) {
    console.error(result.error.format());
}


const invalidEvent = {
    ...validEvent,
    eventType: "RISK-001",
};

const invalidResult = FinancialEventSchema.safeParse(invalidEvent);

console.log("Invalid event:", invalidResult.success);

if (!invalidResult.success) {
    console.error(invalidResult.error.format());
}