import { describe, expect, it } from "vitest";

import {
    formatCurrency,
    formatDate,
    formatSmsContent,
    MAX_SMS_LENGTH,
    TemplateEngine,
    TemplateValidationError,
    truncateText,
    type TemplateDefinition,
    validateTemplateContext,
} from "../index";

const requiredTemplate: TemplateDefinition = {
    templateKey: "edge-case",
    eventType: "TXNX-001",
    channel: "SMS",
    language: "en",
    version: 1,
    requiredFields: ["userName", "amount"],
    content: "{{userName}}: {{currency amount}}",
};

describe("template rendering edge cases", () => {
    const engine = new TemplateEngine();

    it("HTML-escapes an untrusted personalization value", () => {
        expect(engine.render("Hello {{userName}}", {
            userName: "<img src=x onerror=alert(1)>",
        })).toContain("&lt;img");
    });

    it("retains apostrophes, ampersands, and emoji in plain text", () => {
        expect(engine.render("Hi {{userName}}", {
            userName: "Aditi's R&D 📈",
        })).toBe("Hi Aditi&#x27;s R&amp;D 📈");
    });

    it("accepts zero as a valid required numeric field", () => {
        expect(() => validateTemplateContext(requiredTemplate, {
            userName: "Aditi",
            amount: 0,
        })).not.toThrow();
    });

    it("accepts false as a valid required boolean field", () => {
        expect(() => validateTemplateContext({
            ...requiredTemplate,
            requiredFields: ["enabled"],
        }, { enabled: false })).not.toThrow();
    });

    it("rejects an empty required field", () => {
        expect(() => validateTemplateContext(requiredTemplate, {
            userName: "",
            amount: 100,
        })).toThrow(TemplateValidationError);
    });

    it("reports a missing nested personalization value", () => {
        expect(() => validateTemplateContext({
            ...requiredTemplate,
            requiredFields: ["portfolio.holdings.name"],
        }, { portfolio: { holdings: {} } })).toThrow(TemplateValidationError);
    });

    it("renders a long customer name without breaking the template", () => {
        const userName = "Aditi ".repeat(50).trim();
        const result = engine.renderTemplate({
            ...requiredTemplate,
            requiredFields: ["userName"],
            content: "Hello {{userName}}",
        }, { userName });

        expect(result).toContain(userName);
    });

    it("keeps a 160-character SMS unchanged", () => {
        const content = "A".repeat(MAX_SMS_LENGTH);

        expect(formatSmsContent(content)).toBe(content);
    });

    it("shortens a 161-character SMS", () => {
        const result = formatSmsContent(`${"Alert ".repeat(27)}x`);

        expect(result.length).toBeLessThanOrEqual(MAX_SMS_LENGTH);
        expect(result.endsWith("...")).toBe(true);
    });

    it("rejects an invalid value for the currency helper", () => {
        expect(() => formatCurrency("not-a-number")).toThrow(TypeError);
    });

    it("rejects an invalid value for the date helper", () => {
        expect(() => formatDate("not-a-date")).toThrow(TypeError);
    });

    it("rejects a truncation length that cannot contain its suffix", () => {
        expect(() => truncateText("ZeTheta", 3)).toThrow(RangeError);
    });
});
