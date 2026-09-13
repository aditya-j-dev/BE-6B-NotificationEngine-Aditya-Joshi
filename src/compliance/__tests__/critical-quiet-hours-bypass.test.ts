import { describe, expect, it, vi } from "vitest";

import { CriticalQuietHoursBypassService } from "../critical-quiet-hours-bypass";

const createAudit = vi.fn().mockResolvedValue({ id: "audit-1" });
const service = new CriticalQuietHoursBypassService({
    quietHoursBypassAuditLog: { create: createAudit },
});

const request = {
    notificationId: "1f02bf7a-1093-4d3b-8931-86f7ed490b9f",
    eventId: "RISK-002-event-1",
    eventType: "RISK-002",
    userId: "f282c7c5-852b-4a9d-beb7-a1bbcaefac14",
    priority: "CRITICAL" as const,
    timezone: "Asia/Kolkata",
    quietHours: { start: "22:00", end: "07:00" },
};

describe("CriticalQuietHoursBypassService", () => {
    it("bypasses quiet hours for a critical notification and records an audit entry", async () => {
        const result = await service.evaluate(
            request,
            new Date("2026-09-13T17:30:00.000Z"),
        );

        expect(result).toEqual({
            status: "DELIVER_NOW",
            timezone: "Asia/Kolkata",
            localTime: "23:00",
            reason: "CRITICAL_BYPASS",
        });
        expect(createAudit).toHaveBeenCalledWith({
            data: {
                notificationId: request.notificationId,
                eventId: request.eventId,
                eventType: request.eventType,
                userId: request.userId,
                priority: "CRITICAL",
                timezone: "Asia/Kolkata",
                localTime: "23:00",
                quietHoursStart: "22:00",
                quietHoursEnd: "07:00",
                reason: "CRITICAL_FINANCIAL_NOTIFICATION",
            },
        });
    });

    it("does not bypass or write an audit record for a non-critical notification", async () => {
        createAudit.mockClear();
        const result = await service.evaluate({ ...request, priority: "HIGH" }, new Date("2026-09-13T17:30:00.000Z"));

        expect(result).toMatchObject({
            status: "DEFER_UNTIL_QUIET_HOURS_END",
            reason: "QUIET_HOURS",
        });
        expect(createAudit).not.toHaveBeenCalled();
    });

    it("does not create a bypass audit entry outside quiet hours", async () => {
        createAudit.mockClear();
        const result = await service.evaluate(request, new Date("2026-09-13T15:30:00.000Z"));

        expect(result).toMatchObject({
            status: "DELIVER_NOW",
            reason: "OUTSIDE_QUIET_HOURS",
        });
        expect(createAudit).not.toHaveBeenCalled();
    });

    it("does not authorize delivery when the mandatory audit write fails", async () => {
        const failingService = new CriticalQuietHoursBypassService({
            quietHoursBypassAuditLog: {
                create: vi.fn().mockRejectedValue(new Error("database unavailable")),
            },
        });

        await expect(failingService.evaluate(request, new Date("2026-09-13T17:30:00.000Z")))
            .rejects.toThrow("database unavailable");
    });
});
