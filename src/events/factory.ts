import { randomUUID } from "crypto";

import type { FinancialEvent } from "./types";
import { FinancialEventSchema } from "./schemas";


// ============================================================
// Helpers
// ============================================================

function createBaseEvent(
    eventType: string,
    eventCategory: FinancialEvent["eventCategory"],
    priority: FinancialEvent["priority"] = "NORMAL",
) {
    return {
        eventId: randomUUID(),
        eventType,
        eventCategory,
        userId: randomUUID(),
        occurredAt: new Date().toISOString(),
        correlationId: randomUUID(),
        source: "event-factory",
        priority,
    };
}


// ============================================================
// Event Factory
// ============================================================

export function createTestEvent(
    eventType: FinancialEvent["eventType"],
): FinancialEvent {
    let event: FinancialEvent;

    switch (eventType) {

        // ----------------------------------------------------
        // Transaction
        // ----------------------------------------------------

        case "TXNX-001":
            event = {
                ...createBaseEvent(
                    "TXNX-001",
                    "transaction",
                    "HIGH",
                ),
                eventType: "TXNX-001",
                eventCategory: "transaction",
                stockName: "RELIANCE",
                quantity: 10,
                price: 2500,
                total: 25000,
                portfolioImpact: 25000,
            };
            break;

        case "TXNX-002":
            event = {
                ...createBaseEvent(
                    "TXNX-002",
                    "transaction",
                    "HIGH",
                ),
                eventType: "TXNX-002",
                eventCategory: "transaction",
                stockName: "TCS",
                quantity: 5,
                price: 3500,
                pnl: 2500,
                taxImplication: 500,
            };
            break;

        case "TXNX-003":
            event = {
                ...createBaseEvent(
                    "TXNX-003",
                    "transaction",
                    "CRITICAL",
                ),
                eventType: "TXNX-003",
                eventCategory: "transaction",
                reasonCode: "INSUFFICIENT_MARGIN",
                alternativeAction: "Add funds to your trading account",
                supportLink: "https://example.com/support",
            };
            break;

        case "TXNX-004":
            event = {
                ...createBaseEvent(
                    "TXNX-004",
                    "transaction",
                    "HIGH",
                ),
                eventType: "TXNX-004",
                eventCategory: "transaction",
                company: "RELIANCE",
                amount: 1250,
                recordDate: "2026-08-15",
                bankAccount: "XXXX1234",
            };
            break;

        case "TXNX-005":
            event = {
                ...createBaseEvent(
                    "TXNX-005",
                    "transaction",
                    "HIGH",
                ),
                eventType: "TXNX-005",
                eventCategory: "transaction",
                amount: 50000,
                source: "BANK_TRANSFER",
                availableBalance: 75000,
            };
            break;


        // ----------------------------------------------------
        // Risk & Margin
        // ----------------------------------------------------

        case "RISK-001":
            event = {
                ...createBaseEvent(
                    "RISK-001",
                    "risk_margin",
                    "CRITICAL",
                ),
                eventType: "RISK-001",
                eventCategory: "risk_margin",
                shortfallAmount: 50000,
                deadline: "2026-08-16T14:00:00.000Z",
                liquidationRisk: "HIGH",
            };
            break;

        case "RISK-002":
            event = {
                ...createBaseEvent(
                    "RISK-002",
                    "risk_margin",
                    "CRITICAL",
                ),
                eventType: "RISK-002",
                eventCategory: "risk_margin",
                shortfall: 25000,
                actionRequired: "Add funds to restore margin",
                autoSquareOffTime: "2026-08-16T15:00:00.000Z",
            };
            break;

        case "RISK-003":
            event = {
                ...createBaseEvent(
                    "RISK-003",
                    "risk_margin",
                    "CRITICAL",
                ),
                eventType: "RISK-003",
                eventCategory: "risk_margin",
                positionsClosed: ["RELIANCE", "TCS"],
                pnlImpact: -5000,
                remainingPositions: ["INFY", "HDFC"],
            };
            break;

        case "RISK-004":
            event = {
                ...createBaseEvent(
                    "RISK-004",
                    "risk_margin",
                    "CRITICAL",
                ),
                eventType: "RISK-004",
                eventCategory: "risk_margin",
                riskMetricBreached: "PORTFOLIO_VOLATILITY",
                affectedHoldings: ["RELIANCE", "TCS"],
                suggestion: "Consider reducing concentrated positions",
            };
            break;

        case "RISK-005":
            event = {
                ...createBaseEvent(
                    "RISK-005",
                    "risk_margin",
                    "CRITICAL",
                ),
                eventType: "RISK-005",
                eventCategory: "risk_margin",
                concentratedAsset: "RELIANCE",
                allocationPercentage: 42.5,
            };
            break;


        // ----------------------------------------------------
        // SIP & Investment
        // ----------------------------------------------------

        case "SIPX-001":
            event = {
                ...createBaseEvent(
                    "SIPX-001",
                    "sip_investment",
                    "NORMAL",
                ),
                eventType: "SIPX-001",
                eventCategory: "sip_investment",
                fundName: "Nifty 50 Index Fund",
                amount: 5000,
                dueDate: "2026-08-20",
                bankBalanceCheck: 25000,
            };
            break;

        case "SIPX-002":
            event = {
                ...createBaseEvent(
                    "SIPX-002",
                    "sip_investment",
                    "HIGH",
                ),
                eventType: "SIPX-002",
                eventCategory: "sip_investment",
                fund: "Nifty 50 Index Fund",
                unitsAllotted: 38.46,
                nav: 130,
                totalInvestment: 5000,
            };
            break;

        case "SIPX-003":
            event = {
                ...createBaseEvent(
                    "SIPX-003",
                    "sip_investment",
                    "CRITICAL",
                ),
                eventType: "SIPX-003",
                eventCategory: "sip_investment",
                reason: "INSUFFICIENT_BALANCE",
                retryDate: "2026-08-21",
                actionRequired: "Maintain sufficient bank balance",
            };
            break;

        case "SIPX-004":
            event = {
                ...createBaseEvent(
                    "SIPX-004",
                    "sip_investment",
                    "NORMAL",
                ),
                eventType: "SIPX-004",
                eventCategory: "sip_investment",
                currentAmount: 5000,
                suggestedIncrease: 1000,
                goalImpact: "Goal may be achieved 8 months earlier",
            };
            break;

        case "SIPX-005":
            event = {
                ...createBaseEvent(
                    "SIPX-005",
                    "sip_investment",
                    "NORMAL",
                ),
                eventType: "SIPX-005",
                eventCategory: "sip_investment",
                goalName: "Retirement Fund",
                percentageComplete: 50,
                projectedCompletion: "2035-06-01",
            };
            break;


        // ----------------------------------------------------
        // Market & Price
        // ----------------------------------------------------

        case "MKTX-001":
            event = {
                ...createBaseEvent(
                    "MKTX-001",
                    "market_price",
                    "NORMAL",
                ),
                eventType: "MKTX-001",
                eventCategory: "market_price",
                stock: "RELIANCE",
                targetPrice: 2500,
                currentPrice: 2525,
                direction: "UP",
            };
            break;

        case "MKTX-002":
            event = {
                ...createBaseEvent(
                    "MKTX-002",
                    "market_price",
                    "CRITICAL",
                ),
                eventType: "MKTX-002",
                eventCategory: "market_price",
                stock: "ABC LTD",
                circuitLevel: 20,
                tradingHaltDuration: 30,
            };
            break;

        case "MKTX-003":
            event = {
                ...createBaseEvent(
                    "MKTX-003",
                    "market_price",
                    "LOW",
                ),
                eventType: "MKTX-003",
                eventCategory: "market_price",
                marketStatus: "OPEN",
                indexLevels: {
                    NIFTY50: 24500,
                    SENSEX: 80000,
                },
                portfolioOvernightChange: 1.25,
            };
            break;

        case "MKTX-004":
            event = {
                ...createBaseEvent(
                    "MKTX-004",
                    "market_price",
                    "NORMAL",
                ),
                eventType: "MKTX-004",
                eventCategory: "market_price",
                stock: "INFOSYS",
                milestone: "HIGH",
                holdingStatus: "HELD",
            };
            break;

        case "MKTX-005":
            event = {
                ...createBaseEvent(
                    "MKTX-005",
                    "market_price",
                    "NORMAL",
                ),
                eventType: "MKTX-005",
                eventCategory: "market_price",
                company: "TCS",
                announcementDate: "2026-08-20",
                expectedEps: 18.5,
                historical: "EPS increased 12% YoY",
            };
            break;


        // ----------------------------------------------------
        // Regulatory & Compliance
        // ----------------------------------------------------

        case "REGX-001":
            event = {
                ...createBaseEvent(
                    "REGX-001",
                    "regulatory_compliance",
                    "HIGH",
                ),
                eventType: "REGX-001",
                eventCategory: "regulatory_compliance",
                expiryDate: "2026-09-30",
                documentsNeeded: ["PAN", "ADDRESS_PROOF"],
                submissionLink: "https://example.com/kyc",
            };
            break;

        case "REGX-002":
            event = {
                ...createBaseEvent(
                    "REGX-002",
                    "regulatory_compliance",
                    "HIGH",
                ),
                eventType: "REGX-002",
                eventCategory: "regulatory_compliance",
                currentNomineeStatus: "NOT_UPDATED",
                deadline: "2026-09-15",
                link: "https://example.com/nominee",
            };
            break;

        case "REGX-003":
            event = {
                ...createBaseEvent(
                    "REGX-003",
                    "regulatory_compliance",
                    "HIGH",
                ),
                eventType: "REGX-003",
                eventCategory: "regulatory_compliance",
                tradeDate: "2026-08-16",
                pdfAttachment: "contract-note-2026-08-16.pdf",
                summary: "Contract note generated for today's trades",
            };
            break;

        case "REGX-004":
            event = {
                ...createBaseEvent(
                    "REGX-004",
                    "regulatory_compliance",
                    "HIGH",
                ),
                eventType: "REGX-004",
                eventCategory: "regulatory_compliance",
                period: "FY 2025-26",
                downloadLink: "https://example.com/tax-statement",
                keyFigures: {
                    totalCapitalGains: 125000,
                    totalTaxableIncome: 850000,
                },
            };
            break;

        case "REGX-005":
            event = {
                ...createBaseEvent(
                    "REGX-005",
                    "regulatory_compliance",
                    "CRITICAL",
                ),
                eventType: "REGX-005",
                eventCategory: "regulatory_compliance",
                changeSummary:
                    "New regulatory requirements have been introduced",
                impactOnUser:
                    "Additional verification may be required",
                effectiveDate: "2026-10-01",
            };
            break;

        default:
            throw new Error(`Unsupported event type: ${eventType}`);
    }

    // Runtime validation before returning the event.
    const validationResult = FinancialEventSchema.safeParse(event);

    if (!validationResult.success) {
        throw new Error(
            `Generated invalid event ${eventType}: ${validationResult.error.message}`,
        );
    }

    return event;
}