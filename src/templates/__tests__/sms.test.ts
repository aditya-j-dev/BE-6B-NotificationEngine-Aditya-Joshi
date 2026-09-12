import { describe, expect, it } from "vitest";

import {
    formatSmsContent,
    MAX_SMS_LENGTH,
    SmsContentError,
} from "../index";

describe("formatSmsContent", () => {
    it("leaves a single-message SMS unchanged", () => {
        const content = "ZeTheta: Your order was executed.";

        expect(formatSmsContent(content)).toBe(content);
    });

    it("shortens long SMS content at a word boundary", () => {
        const content = "Your portfolio update ".repeat(12);
        const result = formatSmsContent(content);

        expect(result.length).toBeLessThanOrEqual(MAX_SMS_LENGTH);
        expect(result).toMatch(/\.\.\.$/);
        expect(result).not.toContain("portfol...");
    });

    it("retains a complete link when shortening a long SMS", () => {
        const link = "https://ztheta.example/portfolio/notification/123";
        const content = `${"Your portfolio needs attention ".repeat(10)}${link}`;
        const result = formatSmsContent(content);

        expect(result.length).toBeLessThanOrEqual(MAX_SMS_LENGTH);
        expect(result.endsWith(link)).toBe(true);
        expect(result).toContain(" … ");
    });

    it("rejects a link payload that cannot fit in one SMS", () => {
        const link = `https://ztheta.example/${"a".repeat(MAX_SMS_LENGTH)}`;
        const content = `${"Alert ".repeat(10)}${link}`;

        expect(() => formatSmsContent(content)).toThrow(SmsContentError);
    });
});
