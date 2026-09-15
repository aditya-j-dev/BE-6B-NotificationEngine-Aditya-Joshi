import type { DeliveryResult } from "../providers";

export type DlqFailureClassification = "TRANSIENT" | "PERMANENT" | "CONFIGURATION_ERROR";

type FailedDelivery = Extract<DeliveryResult, { status: "FAILED" }>;

const CONFIGURATION_MARKERS = [
    "AUTH", "API_KEY", "ACCOUNT_SID", "CONFIG", "CREDENTIAL", "FORBIDDEN", "UNAUTHORIZED",
    "INVALID_SENDER", "MISSING_SENDER", "PROJECT_ID",
];
const PERMANENT_MARKERS = [
    "INVALID_RECIPIENT", "INVALID_REGISTRATION_TOKEN", "RECIPIENT_REJECTED", "BOUNCED",
    "UNREGISTERED", "DND", "OPT_OUT", "NOT_FOUND", "TEMPLATE_REJECTED",
];

/** Classifies failures deterministically so operators can triage the DLQ consistently. */
export class DlqFailureClassifier {
    classify(failure: FailedDelivery): DlqFailureClassification {
        const evidence = `${failure.failureCode} ${failure.failureReason}`.toUpperCase();
        if (CONFIGURATION_MARKERS.some((marker) => evidence.includes(marker))) {
            return "CONFIGURATION_ERROR";
        }
        if (!failure.retryable || PERMANENT_MARKERS.some((marker) => evidence.includes(marker))) {
            return "PERMANENT";
        }
        return "TRANSIENT";
    }
}
