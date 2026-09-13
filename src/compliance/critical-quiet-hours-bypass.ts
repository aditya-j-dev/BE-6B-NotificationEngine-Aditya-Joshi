import type { EventPriority } from "../events/types";
import {
    QuietHoursService,
    type QuietHoursDecision,
    type QuietHoursRequest,
} from "./quiet-hours";

export interface CriticalQuietHoursBypassRequest extends QuietHoursRequest {
    notificationId: string;
    eventId: string;
    eventType: string;
    priority: EventPriority;
}

export interface QuietHoursBypassAuditEntry {
    notificationId: string;
    eventId: string;
    eventType: string;
    userId: string;
    priority: "CRITICAL";
    timezone: string;
    localTime: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    reason: "CRITICAL_FINANCIAL_NOTIFICATION";
}

export interface QuietHoursBypassAuditStore {
    quietHoursBypassAuditLog: {
        create(args: { data: QuietHoursBypassAuditEntry }): Promise<unknown>;
    };
}

export type CriticalQuietHoursDecision = QuietHoursDecision | {
    status: "DELIVER_NOW";
    timezone: string;
    localTime: string;
    reason: "CRITICAL_BYPASS";
};

/**
 * Allows only CRITICAL financial notifications to bypass a quiet-hours deferral.
 * The audit write deliberately occurs before returning DELIVER_NOW, so a bypass
 * cannot be delivered without a durable compliance record.
 */
export class CriticalQuietHoursBypassService {
    constructor(
        private readonly auditStore: QuietHoursBypassAuditStore,
        private readonly quietHours = new QuietHoursService(),
    ) { }

    async evaluate(
        request: CriticalQuietHoursBypassRequest,
        now = new Date(),
    ): Promise<CriticalQuietHoursDecision> {
        const decision = this.quietHours.evaluate(request, now);

        if (
            request.priority !== "CRITICAL"
            || decision.status !== "DEFER_UNTIL_QUIET_HOURS_END"
        ) {
            return decision;
        }

        await this.auditStore.quietHoursBypassAuditLog.create({
            data: {
                notificationId: request.notificationId,
                eventId: request.eventId,
                eventType: request.eventType,
                userId: request.userId,
                priority: "CRITICAL",
                timezone: decision.timezone,
                localTime: decision.localTime,
                quietHoursStart: request.quietHours.start,
                quietHoursEnd: request.quietHours.end,
                reason: "CRITICAL_FINANCIAL_NOTIFICATION",
            },
        });

        return {
            status: "DELIVER_NOW",
            timezone: decision.timezone,
            localTime: decision.localTime,
            reason: "CRITICAL_BYPASS",
        };
    }
}
