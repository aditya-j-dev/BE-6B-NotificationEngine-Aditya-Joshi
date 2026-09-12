import { describe, expect, it } from "vitest";

import { createTestEvent } from "../../events/factory";
import {
    PersonalizationPipeline,
    type TemplateDefinition,
} from "../index";

const template: TemplateDefinition = {
    templateKey: "TXNX-001",
    eventType: "TXNX-001",
    channel: "SMS",
    language: "en",
    version: 1,
    requiredFields: ["userName", "stockName", "formatted.total"],
    content: "Hi {{userName}}, {{stockName}} total {{formatted.total}}.",
};

describe("PersonalizationPipeline", () => {
    it("resolves context, formats financial values, and renders", () => {
        const event = createTestEvent("TXNX-001");
        const pipeline = new PersonalizationPipeline();

        const result = pipeline.render({
            event,
            template,
            user: {
                id: event.userId,
                phone: "+919000000001",
                email: "investor@example.com",
                name: "Aditi",
                language: "en",
                timezone: "Asia/Kolkata",
                segment: "STANDARD",
            },
        });

        expect(result.context.userName).toBe("Aditi");
        expect(result.context.formatted).toMatchObject({
            total: expect.stringContaining("₹"),
        });
        expect(result.renderedContent).toContain("Hi Aditi");
        expect(result.renderedContent).toContain("RELIANCE");
    });

    it("derives profit/loss fields and applies a fallback user name", () => {
        const event = {
            ...createTestEvent("TXNX-002"),
            pnl: -100,
        };
        const pipeline = new PersonalizationPipeline();
        const result = pipeline.render({
            event,
            template: {
                ...template,
                requiredFields: ["userName", "pnlDirection"],
                content: "{{userName}} has a {{pnlDirection}}.",
            },
            user: {
                id: event.userId,
                phone: "+919000000001",
                email: "investor@example.com",
                name: null,
                language: "en",
                timezone: "Asia/Kolkata",
                segment: "STANDARD",
            },
        });

        expect(result.context.userName).toBe("Investor");
        expect(result.context.pnlDirection).toBe("loss");
        expect(result.renderedContent).toBe("Investor has a loss.");
    });
});
