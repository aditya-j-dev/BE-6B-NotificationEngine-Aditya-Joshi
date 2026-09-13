export interface QuietHoursWindow {
    start: string;
    end: string;
}

export interface QuietHoursRequest {
    userId: string;
    timezone: string;
    quietHours: QuietHoursWindow;
    quietHoursOverride?: boolean;
}

export type QuietHoursDecision =
    | {
        status: "DELIVER_NOW";
        timezone: string;
        localTime: string;
        reason: "OUTSIDE_QUIET_HOURS" | "USER_OVERRIDE";
    }
    | {
        status: "DEFER_UNTIL_QUIET_HOURS_END";
        timezone: string;
        localTime: string;
        resumeAt: string;
        reason: "QUIET_HOURS";
    };

export class InvalidQuietHoursWindowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidQuietHoursWindowError";
    }
}

/** Evaluates quiet hours in the user's own IANA timezone. */
export class QuietHoursService {
    evaluate(
        request: QuietHoursRequest,
        now = new Date(),
    ): QuietHoursDecision {
        const window = this.parseWindow(request.quietHours);
        const localTime = this.localTime(now, request.timezone);

        if (request.quietHoursOverride) {
            return {
                status: "DELIVER_NOW",
                timezone: request.timezone,
                localTime: this.formatTime(localTime),
                reason: "USER_OVERRIDE",
            };
        }

        if (!this.isWithinWindow(localTime.localMinutes, window)) {
            return {
                status: "DELIVER_NOW",
                timezone: request.timezone,
                localTime: this.formatTime(localTime),
                reason: "OUTSIDE_QUIET_HOURS",
            };
        }

        return {
            status: "DEFER_UNTIL_QUIET_HOURS_END",
            timezone: request.timezone,
            localTime: this.formatTime(localTime),
            resumeAt: this.findResumeAt(now, request.timezone, window).toISOString(),
            reason: "QUIET_HOURS",
        };
    }

    private parseWindow(window: QuietHoursWindow): { start: number; end: number } {
        const start = this.toMinutes(window.start);
        const end = this.toMinutes(window.end);

        if (start === end) {
            throw new InvalidQuietHoursWindowError(
                "Quiet-hours start and end must not be the same time",
            );
        }

        return { start, end };
    }

    private toMinutes(value: string): number {
        const match = /^(\d{2}):(\d{2})$/.exec(value);

        if (!match) {
            throw new InvalidQuietHoursWindowError(
                "Quiet-hours times must use HH:MM in 24-hour time",
            );
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);

        if (hours > 23 || minutes > 59) {
            throw new InvalidQuietHoursWindowError("Quiet-hours time is out of range");
        }

        return (hours * 60) + minutes;
    }

    private isWithinWindow(
        localMinutes: number,
        window: { start: number; end: number },
    ): boolean {
        if (window.start < window.end) {
            return localMinutes >= window.start && localMinutes < window.end;
        }

        return localMinutes >= window.start || localMinutes < window.end;
    }

    private localTime(
        timestamp: Date,
        timezone: string,
    ): { hours: number; minute: number; localMinutes: number } {
        const parts = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            timeZone: timezone,
        }).formatToParts(timestamp);
        const hours = Number(parts.find(({ type }) => type === "hour")?.value);
        const minute = Number(parts.find(({ type }) => type === "minute")?.value);

        return { hours, minute, localMinutes: (hours * 60) + minute };
    }

    private formatTime(time: { hours: number; minute: number }): string {
        const hours = time.hours;
        const minutes = time.minute;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    private findResumeAt(
        now: Date,
        timezone: string,
        window: { start: number; end: number },
    ): Date {
        let candidate = new Date(now.getTime());
        candidate.setUTCSeconds(0, 0);

        for (let minute = 0; minute <= 1560; minute += 1) {
            const localTime = this.localTime(candidate, timezone);

            if (!this.isWithinWindow(localTime.localMinutes, window)) {
                return candidate;
            }

            candidate = new Date(candidate.getTime() + 60_000);
        }

        throw new Error("Could not find the end of the quiet-hours window");
    }
}
