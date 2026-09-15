import type { DeliveryProvider } from "../providers";
import { createNodemailerEmailProviderFromEnv } from "../providers";

import type { DlqDepthAlert, OperationsAlerter } from "./alerting";

export class DlqEmailAlertConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DlqEmailAlertConfigurationError";
    }
}

/** Sends DLQ depth alerts through the existing email delivery-provider contract. */
export class EmailOperationsAlerter implements OperationsAlerter {
    constructor(
        private readonly provider: DeliveryProvider,
        private readonly recipient: string,
    ) { }

    async send(alert: DlqDepthAlert): Promise<void> {
        const result = await this.provider.send({
            notificationId: `dlq-depth-${alert.observedAt}`,
            eventId: `dlq-depth-${alert.observedAt}`,
            eventType: "DLQ_DEPTH_ALERT",
            userId: "operations",
            channel: "EMAIL",
            recipient: this.recipient,
            subject: `[${alert.severity}] ZeTheta DLQ depth is ${alert.depth}`,
            content: [
                `ZeTheta has ${alert.depth} unresolved dead-letter queue entries.`,
                `Configured alert threshold: ${alert.threshold}.`,
                `Observed at: ${alert.observedAt}.`,
                "Open the DLQ dashboard to triage the affected notifications.",
            ].join("\n"),
            metadata: {
                alertType: "DLQ_DEPTH",
                severity: alert.severity,
                depth: alert.depth,
                threshold: alert.threshold,
            },
        });
        if (result.status === "FAILED") {
            throw new Error(`DLQ operations email failed: ${result.failureReason}`);
        }
    }
}

export function createEmailOperationsAlerterFromEnv(
    environment: NodeJS.ProcessEnv = process.env,
): EmailOperationsAlerter {
    const recipient = environment.OPS_ALERT_EMAIL?.trim();
    if (!recipient) {
        throw new DlqEmailAlertConfigurationError("OPS_ALERT_EMAIL is required for DLQ email alerts");
    }
    return new EmailOperationsAlerter(createNodemailerEmailProviderFromEnv(environment), recipient);
}
