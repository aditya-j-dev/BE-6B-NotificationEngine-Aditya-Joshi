// ============================================================
// Common Types
// ============================================================

export type EventPriority =
    | "CRITICAL"
    | "HIGH"
    | "NORMAL"
    | "LOW"
    | "VERY_LOW";

export type EventCategory =
    | "transaction"
    | "risk_margin"
    | "sip_investment"
    | "market_price"
    | "regulatory_compliance";

export interface BaseEvent {
    eventId: string;
    eventType: string;
    eventCategory: EventCategory;
    userId: string;
    occurredAt: string;
    correlationId: string;
    source: string;
    priority: EventPriority;
    metadata?: Record<string, unknown>;
}


// ============================================================
// Transaction Events
// ============================================================

export interface BuyOrderExecutedEvent extends BaseEvent {
    eventType: "TXNX-001";
    eventCategory: "transaction";

    stockName: string;
    quantity: number;
    price: number;
    total: number;
    portfolioImpact: number;
}

export interface SellOrderExecutedEvent extends BaseEvent {
    eventType: "TXNX-002";
    eventCategory: "transaction";

    stockName: string;
    quantity: number;
    price: number;
    pnl: number;
    taxImplication: number;
}

export interface OrderRejectedEvent extends BaseEvent {
    eventType: "TXNX-003";
    eventCategory: "transaction";

    reasonCode: string;
    alternativeAction: string;
    supportLink: string;
}

export interface DividendCreditedEvent extends BaseEvent {
    eventType: "TXNX-004";
    eventCategory: "transaction";

    company: string;
    amount: number;
    recordDate: string;
    bankAccount: string;
}

export interface FundsDepositedEvent extends BaseEvent {
    eventType: "TXNX-005";
    eventCategory: "transaction";

    amount: number;
    source: string;
    availableBalance: number;
}


// ============================================================
// Risk & Margin Events
// ============================================================

export interface MarginCallWarningEvent extends BaseEvent {
    eventType: "RISK-001";
    eventCategory: "risk_margin";

    shortfallAmount: number;
    deadline: string;
    liquidationRisk: string;
}

export interface MarginShortfallEvent extends BaseEvent {
    eventType: "RISK-002";
    eventCategory: "risk_margin";

    shortfall: number;
    actionRequired: string;
    autoSquareOffTime: string;
}

export interface PositionSquaredOffEvent extends BaseEvent {
    eventType: "RISK-003";
    eventCategory: "risk_margin";

    positionsClosed: string[];
    pnlImpact: number;
    remainingPositions: string[];
}

export interface PortfolioRiskAlertEvent extends BaseEvent {
    eventType: "RISK-004";
    eventCategory: "risk_margin";

    riskMetricBreached: string;
    affectedHoldings: string[];
    suggestion: string;
}

export interface ConcentrationAlertEvent extends BaseEvent {
    eventType: "RISK-005";
    eventCategory: "risk_margin";

    concentratedAsset: string;
    allocationPercentage: number;
}


// ============================================================
// SIP & Investment Events
// ============================================================

export interface SipDueReminderEvent extends BaseEvent {
    eventType: "SIPX-001";
    eventCategory: "sip_investment";

    fundName: string;
    amount: number;
    dueDate: string;
    bankBalanceCheck: number;
}

export interface SipExecutedEvent extends BaseEvent {
    eventType: "SIPX-002";
    eventCategory: "sip_investment";

    fund: string;
    unitsAllotted: number;
    nav: number;
    totalInvestment: number;
}

export interface SipFailedEvent extends BaseEvent {
    eventType: "SIPX-003";
    eventCategory: "sip_investment";

    reason: string;
    retryDate: string;
    actionRequired: string;
}

export interface SipStepUpReminderEvent extends BaseEvent {
    eventType: "SIPX-004";
    eventCategory: "sip_investment";

    currentAmount: number;
    suggestedIncrease: number;
    goalImpact: string;
}

export interface GoalMilestoneReachedEvent extends BaseEvent {
    eventType: "SIPX-005";
    eventCategory: "sip_investment";

    goalName: string;
    percentageComplete: number;
    projectedCompletion: string;
}


// ============================================================
// Market & Price Events
// ============================================================

export interface PriceAlertTriggeredEvent extends BaseEvent {
    eventType: "MKTX-001";
    eventCategory: "market_price";

    stock: string;
    targetPrice: number;
    currentPrice: number;
    direction: "UP" | "DOWN";
}

export interface CircuitBreakerHitEvent extends BaseEvent {
    eventType: "MKTX-002";
    eventCategory: "market_price";

    stock: string;
    circuitLevel: number;
    tradingHaltDuration: number;
}

export interface MarketOpenCloseEvent extends BaseEvent {
    eventType: "MKTX-003";
    eventCategory: "market_price";

    marketStatus: "OPEN" | "CLOSED";
    indexLevels: Record<string, number>;
    portfolioOvernightChange: number;
}

export interface FiftyTwoWeekHighLowEvent extends BaseEvent {
    eventType: "MKTX-004";
    eventCategory: "market_price";

    stock: string;
    milestone: "HIGH" | "LOW";
    holdingStatus: string;
}

export interface EarningsAnnouncementEvent extends BaseEvent {
    eventType: "MKTX-005";
    eventCategory: "market_price";

    company: string;
    announcementDate: string;
    expectedEps: number;
    historical: string;
}


// ============================================================
// Regulatory & Compliance Events
// ============================================================

export interface KycExpiryWarningEvent extends BaseEvent {
    eventType: "REGX-001";
    eventCategory: "regulatory_compliance";

    expiryDate: string;
    documentsNeeded: string[];
    submissionLink: string;
}

export interface NomineeUpdateReminderEvent extends BaseEvent {
    eventType: "REGX-002";
    eventCategory: "regulatory_compliance";

    currentNomineeStatus: string;
    deadline: string;
    link: string;
}

export interface ContractNoteGeneratedEvent extends BaseEvent {
    eventType: "REGX-003";
    eventCategory: "regulatory_compliance";

    tradeDate: string;
    pdfAttachment: string;
    summary: string;
}

export interface TaxStatementAvailableEvent extends BaseEvent {
    eventType: "REGX-004";
    eventCategory: "regulatory_compliance";

    period: string;
    downloadLink: string;
    keyFigures: Record<string, number>;
}

export interface RegulatoryPolicyChangeEvent extends BaseEvent {
    eventType: "REGX-005";
    eventCategory: "regulatory_compliance";

    changeSummary: string;
    impactOnUser: string;
    effectiveDate: string;
}


// ============================================================
// Union of all 25 Financial Events
// ============================================================

export type FinancialEvent =
    | BuyOrderExecutedEvent
    | SellOrderExecutedEvent
    | OrderRejectedEvent
    | DividendCreditedEvent
    | FundsDepositedEvent
    | MarginCallWarningEvent
    | MarginShortfallEvent
    | PositionSquaredOffEvent
    | PortfolioRiskAlertEvent
    | ConcentrationAlertEvent
    | SipDueReminderEvent
    | SipExecutedEvent
    | SipFailedEvent
    | SipStepUpReminderEvent
    | GoalMilestoneReachedEvent
    | PriceAlertTriggeredEvent
    | CircuitBreakerHitEvent
    | MarketOpenCloseEvent
    | FiftyTwoWeekHighLowEvent
    | EarningsAnnouncementEvent
    | KycExpiryWarningEvent
    | NomineeUpdateReminderEvent
    | ContractNoteGeneratedEvent
    | TaxStatementAvailableEvent
    | RegulatoryPolicyChangeEvent;

