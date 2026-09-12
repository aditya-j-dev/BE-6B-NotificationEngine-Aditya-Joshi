import { describe, expect, it } from "vitest";

import {
    TemplateEngine,
    TemplateValidationError,
    type TemplateDefinition,
    validateTemplateContext,
} from "../index";

const template: TemplateDefinition = {
    templateKey: "TXNX-001",
    eventType: "TXNX-001",
    channel: "SMS",
    language: "en",
    version: 1,
    requiredFields: ["stockName", "order.quantity"],
    content: "{{stockName}}: {{order.quantity}}",
};

describe("template validation", () => {
    it("accepts complete personalization data", () => {
        expect(() => validateTemplateContext(template, {
            stockName: "RELIANCE",
            order: { quantity: 10 },
        })).not.toThrow();
    });

    it("reports every missing or null required field", () => {
        try {
            validateTemplateContext(template, {
                stockName: null,
                order: {},
            });
        } catch (error) {
            expect(error).toBeInstanceOf(TemplateValidationError);
            expect((error as TemplateValidationError).missingFields)
                .toEqual(["stockName", "order.quantity"]);
        }
    });

    it("validates before rendering a template definition", () => {
        const engine = new TemplateEngine();

        expect(() => engine.renderTemplate(template, {
            stockName: "RELIANCE",
            order: { quantity: 10 },
        })).not.toThrow();

        expect(() => engine.renderTemplate(template, {
            stockName: "RELIANCE",
            order: {},
        })).toThrow(TemplateValidationError);
    });
});
