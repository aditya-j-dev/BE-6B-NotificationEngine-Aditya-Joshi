import { z } from "zod";

// ============================================================
// Common Schemas
// ============================================================

export const EventPrioritySchema = z.enum([
    "CRITICAL",
    "HIGH",
    "NORMAL",
    "LOW",
    "VERY_LOW",
]);

export const EventCategorySchema = z.enum([
    "transaction",
    "risk_margin",
    "sip_investment",
    "market_price",
    "regulatory_compliance",
]);

const BaseEventSchema = z.object({
    eventId: z.string().min(1),
    eventType: z.string().min(1),
    eventCategory: EventCategorySchema,
    userId: z.string().min(1),
    occurredAt: z.string().datetime(),
    correlationId: z.string().min(1),
    source: z.string().min(1),
    priority: EventPrioritySchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
});


// ============================================================
// Transaction Events
// ============================================================

export const BuyOrderExecutedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("TXNX-001"),
    eventCategory: z.literal("transaction"),

    stockName: z.string().min(1),
    quantity: z.number().positive(),
    price: z.number().nonnegative(),
    total: z.number().nonnegative(),
    portfolioImpact: z.number(),
});

export const SellOrderExecutedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("TXNX-002"),
    eventCategory: z.literal("transaction"),

    stockName: z.string().min(1),
    quantity: z.number().positive(),
    price: z.number().nonnegative(),
    pnl: z.number(),
    taxImplication: z.number().nonnegative(),
});

export const OrderRejectedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("TXNX-003"),
    eventCategory: z.literal("transaction"),

    reasonCode: z.string().min(1),
    alternativeAction: z.string().min(1),
    supportLink: z.string().min(1),
});

export const DividendCreditedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("TXNX-004"),
    eventCategory: z.literal("transaction"),

    company: z.string().min(1),
    amount: z.number().nonnegative(),
    recordDate: z.string(),
    bankAccount: z.string().min(1),
});

export const FundsDepositedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("TXNX-005"),
    eventCategory: z.literal("transaction"),

    amount: z.number().nonnegative(),
    source: z.string().min(1),
    availableBalance: z.number().nonnegative(),
});


// ============================================================
// Risk & Margin Events
// ============================================================

export const MarginCallWarningEventSchema = BaseEventSchema.extend({
    eventType: z.literal("RISK-001"),
    eventCategory: z.literal("risk_margin"),

    shortfallAmount: z.number().positive(),
    deadline: z.string(),
    liquidationRisk: z.string().min(1),
});

export const MarginShortfallEventSchema = BaseEventSchema.extend({
    eventType: z.literal("RISK-002"),
    eventCategory: z.literal("risk_margin"),

    shortfall: z.number().positive(),
    actionRequired: z.string().min(1),
    autoSquareOffTime: z.string(),
});

export const PositionSquaredOffEventSchema = BaseEventSchema.extend({
    eventType: z.literal("RISK-003"),
    eventCategory: z.literal("risk_margin"),

    positionsClosed: z.array(z.string().min(1)).min(1),
    pnlImpact: z.number(),
    remainingPositions: z.array(z.string().min(1)),
});

export const PortfolioRiskAlertEventSchema = BaseEventSchema.extend({
    eventType: z.literal("RISK-004"),
    eventCategory: z.literal("risk_margin"),

    riskMetricBreached: z.string().min(1),
    affectedHoldings: z.array(z.string().min(1)).min(1),
    suggestion: z.string().min(1),
});

export const ConcentrationAlertEventSchema = BaseEventSchema.extend({
    eventType: z.literal("RISK-005"),
    eventCategory: z.literal("risk_margin"),

    concentratedAsset: z.string().min(1),
    allocationPercentage: z.number().min(0).max(100),
});


// ============================================================
// SIP & Investment Events
// ============================================================

export const SipDueReminderEventSchema = BaseEventSchema.extend({
    eventType: z.literal("SIPX-001"),
    eventCategory: z.literal("sip_investment"),

    fundName: z.string().min(1),
    amount: z.number().positive(),
    dueDate: z.string(),
    bankBalanceCheck: z.number().nonnegative(),
});

export const SipExecutedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("SIPX-002"),
    eventCategory: z.literal("sip_investment"),

    fund: z.string().min(1),
    unitsAllotted: z.number().positive(),
    nav: z.number().positive(),
    totalInvestment: z.number().nonnegative(),
});

export const SipFailedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("SIPX-003"),
    eventCategory: z.literal("sip_investment"),

    reason: z.string().min(1),
    retryDate: z.string(),
    actionRequired: z.string().min(1),
});

export const SipStepUpReminderEventSchema = BaseEventSchema.extend({
    eventType: z.literal("SIPX-004"),
    eventCategory: z.literal("sip_investment"),

    currentAmount: z.number().positive(),
    suggestedIncrease: z.number().positive(),
    goalImpact: z.string().min(1),
});

export const GoalMilestoneReachedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("SIPX-005"),
    eventCategory: z.literal("sip_investment"),

    goalName: z.string().min(1),
    percentageComplete: z.number().min(0).max(100),
    projectedCompletion: z.string(),
});


// ============================================================
// Market & Price Events
// ============================================================

export const PriceAlertTriggeredEventSchema = BaseEventSchema.extend({
    eventType: z.literal("MKTX-001"),
    eventCategory: z.literal("market_price"),

    stock: z.string().min(1),
    targetPrice: z.number().nonnegative(),
    currentPrice: z.number().nonnegative(),
    direction: z.enum(["UP", "DOWN"]),
});

export const CircuitBreakerHitEventSchema = BaseEventSchema.extend({
    eventType: z.literal("MKTX-002"),
    eventCategory: z.literal("market_price"),

    stock: z.string().min(1),
    circuitLevel: z.number().positive(),
    tradingHaltDuration: z.number().nonnegative(),
});

export const MarketOpenCloseEventSchema = BaseEventSchema.extend({
    eventType: z.literal("MKTX-003"),
    eventCategory: z.literal("market_price"),

    marketStatus: z.enum(["OPEN", "CLOSED"]),
    indexLevels: z.record(z.string(), z.number()),
    portfolioOvernightChange: z.number(),
});

export const FiftyTwoWeekHighLowEventSchema = BaseEventSchema.extend({
    eventType: z.literal("MKTX-004"),
    eventCategory: z.literal("market_price"),

    stock: z.string().min(1),
    milestone: z.enum(["HIGH", "LOW"]),
    holdingStatus: z.string().min(1),
});

export const EarningsAnnouncementEventSchema = BaseEventSchema.extend({
    eventType: z.literal("MKTX-005"),
    eventCategory: z.literal("market_price"),

    company: z.string().min(1),
    announcementDate: z.string(),
    expectedEps: z.number(),
    historical: z.string().min(1),
});


// ============================================================
// Regulatory & Compliance Events
// ============================================================

export const KycExpiryWarningEventSchema = BaseEventSchema.extend({
    eventType: z.literal("REGX-001"),
    eventCategory: z.literal("regulatory_compliance"),

    expiryDate: z.string(),
    documentsNeeded: z.array(z.string().min(1)).min(1),
    submissionLink: z.string().min(1),
});

export const NomineeUpdateReminderEventSchema = BaseEventSchema.extend({
    eventType: z.literal("REGX-002"),
    eventCategory: z.literal("regulatory_compliance"),

    currentNomineeStatus: z.string().min(1),
    deadline: z.string(),
    link: z.string().min(1),
});

export const ContractNoteGeneratedEventSchema = BaseEventSchema.extend({
    eventType: z.literal("REGX-003"),
    eventCategory: z.literal("regulatory_compliance"),

    tradeDate: z.string(),
    pdfAttachment: z.string().min(1),
    summary: z.string().min(1),
});

export const TaxStatementAvailableEventSchema = BaseEventSchema.extend({
    eventType: z.literal("REGX-004"),
    eventCategory: z.literal("regulatory_compliance"),

    period: z.string().min(1),
    downloadLink: z.string().min(1),
    keyFigures: z.record(z.string(), z.number()),
});

export const RegulatoryPolicyChangeEventSchema = BaseEventSchema.extend({
    eventType: z.literal("REGX-005"),
    eventCategory: z.literal("regulatory_compliance"),

    changeSummary: z.string().min(1),
    impactOnUser: z.string().min(1),
    effectiveDate: z.string(),
});


// ============================================================
// Combined Financial Event Schema
// ============================================================

export const FinancialEventSchema = z.discriminatedUnion("eventType", [
    BuyOrderExecutedEventSchema,
    SellOrderExecutedEventSchema,
    OrderRejectedEventSchema,
    DividendCreditedEventSchema,
    FundsDepositedEventSchema,

    MarginCallWarningEventSchema,
    MarginShortfallEventSchema,
    PositionSquaredOffEventSchema,
    PortfolioRiskAlertEventSchema,
    ConcentrationAlertEventSchema,

    SipDueReminderEventSchema,
    SipExecutedEventSchema,
    SipFailedEventSchema,
    SipStepUpReminderEventSchema,
    GoalMilestoneReachedEventSchema,

    PriceAlertTriggeredEventSchema,
    CircuitBreakerHitEventSchema,
    MarketOpenCloseEventSchema,
    FiftyTwoWeekHighLowEventSchema,
    EarningsAnnouncementEventSchema,

    KycExpiryWarningEventSchema,
    NomineeUpdateReminderEventSchema,
    ContractNoteGeneratedEventSchema,
    TaxStatementAvailableEventSchema,
    RegulatoryPolicyChangeEventSchema,
]);


// ============================================================
// Type inferred directly from the Zod schema
// ============================================================

export type ValidatedFinancialEvent = z.infer<
    typeof FinancialEventSchema
>;