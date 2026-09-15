import { describe, expect, it } from "vitest";

import { DlqFailureClassifier } from "..";

const classifier = new DlqFailureClassifier();

describe("DlqFailureClassifier", () => {
    it("classifies provider outage failures as transient", () => {
        expect(classifier.classify({
            status: "FAILED", failureCode: "HTTP_503", failureReason: "Provider unavailable", retryable: true,
        })).toBe("TRANSIENT");
    });

    it("classifies invalid recipient failures as permanent", () => {
        expect(classifier.classify({
            status: "FAILED", failureCode: "INVALID_RECIPIENT", failureReason: "Recipient is malformed", retryable: false,
        })).toBe("PERMANENT");
    });

    it("prioritises credential and configuration faults for operator remediation", () => {
        expect(classifier.classify({
            status: "FAILED", failureCode: "AUTH_FAILED", failureReason: "Provider credential rejected", retryable: false,
        })).toBe("CONFIGURATION_ERROR");
    });
});
