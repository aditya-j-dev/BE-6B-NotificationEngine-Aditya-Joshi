import { describe, expect, it } from "vitest";

import {
    InvalidQuietHoursWindowError,
    QuietHoursService,
} from "../index";

const service = new QuietHoursService();
const request = {
    userId: "user-1",
    timezone: "Asia/Kolkata",
    quietHours: { start: "22:00", end: "07:00" },
};

describe("QuietHoursService", () => {
    it("defers a notification during overnight quiet hours in the user's timezone", () => {
        const result = service.evaluate(
            request,
            new Date("2026-09-13T17:30:00.000Z"),
        );

        expect(result).toEqual({
            status: "DEFER_UNTIL_QUIET_HOURS_END",
            timezone: "Asia/Kolkata",
            localTime: "23:00",
            resumeAt: "2026-09-14T01:30:00.000Z",
            reason: "QUIET_HOURS",
        });
    });

    it("delivers outside quiet hours", () => {
        expect(service.evaluate(
            request,
            new Date("2026-09-13T15:30:00.000Z"),
        )).toEqual({
            status: "DELIVER_NOW",
            timezone: "Asia/Kolkata",
            localTime: "21:00",
            reason: "OUTSIDE_QUIET_HOURS",
        });
    });

    it("treats the start as inclusive and the end as exclusive", () => {
        expect(service.evaluate(
            request,
            new Date("2026-09-13T16:30:00.000Z"),
        ).status).toBe("DEFER_UNTIL_QUIET_HOURS_END");
        expect(service.evaluate(
            request,
            new Date("2026-09-14T01:30:00.000Z"),
        ).status).toBe("DELIVER_NOW");
    });

    it("uses the timezone instead of the server clock", () => {
        expect(service.evaluate({
            ...request,
            timezone: "Europe/London",
        }, new Date("2026-09-13T22:00:00.000Z"))).toMatchObject({
            status: "DEFER_UNTIL_QUIET_HOURS_END",
            localTime: "23:00",
        });
    });

    it("supports a same-day quiet-hours window", () => {
        expect(service.evaluate({
            ...request,
            quietHours: { start: "13:00", end: "14:00" },
        }, new Date("2026-09-13T08:00:00.000Z"))).toMatchObject({
            status: "DEFER_UNTIL_QUIET_HOURS_END",
            localTime: "13:30",
            resumeAt: "2026-09-13T08:30:00.000Z",
        });
    });

    it("honors a user quiet-hours override", () => {
        expect(service.evaluate({
            ...request,
            quietHoursOverride: true,
        }, new Date("2026-09-13T17:30:00.000Z"))).toMatchObject({
            status: "DELIVER_NOW",
            reason: "USER_OVERRIDE",
        });
    });

    it("rejects invalid or all-day quiet-hours windows", () => {
        expect(() => service.evaluate({
            ...request,
            quietHours: { start: "25:00", end: "07:00" },
        })).toThrow(InvalidQuietHoursWindowError);
        expect(() => service.evaluate({
            ...request,
            quietHours: { start: "22:00", end: "22:00" },
        })).toThrow(InvalidQuietHoursWindowError);
    });
});
