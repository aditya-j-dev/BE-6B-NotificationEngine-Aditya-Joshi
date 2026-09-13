import type { FinancialEvent } from "../events/types";

export type NotificationClassification = "TRANSACTIONAL" | "PROMOTIONAL";

export type ClassificationReason =
    | "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY"
    | "CUSTOMER_REQUESTED_ALERT"
    | "INVESTMENT_MARKETING_OR_GENERAL_MARKET_CONTENT"
    | "PROMOTIONAL_CONTENT_OVERRIDE";

export interface ClassificationInput {
    event: FinancialEvent;
    containsPromotionalContent?: boolean;
}

export interface ClassificationResult {
    classification: NotificationClassification;
    reason: ClassificationReason;
}

const EVENT_CLASSIFICATIONS: Record<
    FinancialEvent["eventType"],
    ClassificationResult
> = {
    "TXNX-001": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "TXNX-002": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "TXNX-003": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "TXNX-004": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "TXNX-005": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "RISK-001": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "RISK-002": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "RISK-003": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "RISK-004": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "RISK-005": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "SIPX-001": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "SIPX-002": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "SIPX-003": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "SIPX-004": { classification: "PROMOTIONAL", reason: "INVESTMENT_MARKETING_OR_GENERAL_MARKET_CONTENT" },
    "SIPX-005": { classification: "TRANSACTIONAL", reason: "CUSTOMER_REQUESTED_ALERT" },
    "MKTX-001": { classification: "TRANSACTIONAL", reason: "CUSTOMER_REQUESTED_ALERT" },
    "MKTX-002": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "MKTX-003": { classification: "PROMOTIONAL", reason: "INVESTMENT_MARKETING_OR_GENERAL_MARKET_CONTENT" },
    "MKTX-004": { classification: "PROMOTIONAL", reason: "INVESTMENT_MARKETING_OR_GENERAL_MARKET_CONTENT" },
    "MKTX-005": { classification: "PROMOTIONAL", reason: "INVESTMENT_MARKETING_OR_GENERAL_MARKET_CONTENT" },
    "REGX-001": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "REGX-002": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "REGX-003": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "REGX-004": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
    "REGX-005": { classification: "TRANSACTIONAL", reason: "FINANCIAL_TRANSACTION_OR_ACCOUNT_SAFETY" },
};

/**
 * Assigns the SMS compliance class. Any promotional copy forces a promotional
 * classification even for an otherwise transactional event.
 */
export class NotificationClassificationEngine {
    classify(input: ClassificationInput): ClassificationResult {
        if (input.containsPromotionalContent) {
            return {
                classification: "PROMOTIONAL",
                reason: "PROMOTIONAL_CONTENT_OVERRIDE",
            };
        }

        return EVENT_CLASSIFICATIONS[input.event.eventType];
    }
}

export { EVENT_CLASSIFICATIONS };
