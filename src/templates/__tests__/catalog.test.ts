import { describe, expect, it } from "vitest";

import { createTestEvent } from "../../events/factory";
import type { FinancialEvent } from "../../events/types";
import {
    PersonalizationPipeline,
    STARTER_TEMPLATES,
    SUPPORTED_TEMPLATE_LANGUAGES,
    TEMPLATE_CHANNELS,
} from "../index";

describe("starter template catalog", () => {
    it("covers every event type, channel, and supported language", () => {
        const eventTypes = new Set(STARTER_TEMPLATES.map(({ eventType }) => eventType));

        expect(eventTypes.size).toBe(25);
        expect(STARTER_TEMPLATES).toHaveLength(
            eventTypes.size * TEMPLATE_CHANNELS.length * SUPPORTED_TEMPLATE_LANGUAGES.length,
        );

        for (const eventType of eventTypes) {
            for (const channel of TEMPLATE_CHANNELS) {
                for (const language of SUPPORTED_TEMPLATE_LANGUAGES) {
                    expect(STARTER_TEMPLATES.some((template) =>
                        template.eventType === eventType &&
                        template.channel === channel &&
                        template.language === language,
                    )).toBe(true);
                }
            }
        }
    });

    it("renders every catalog template from its matching event", () => {
        const pipeline = new PersonalizationPipeline();

        for (const template of STARTER_TEMPLATES) {
            const event = createTestEvent(template.eventType as FinancialEvent["eventType"]);
            const result = pipeline.render({
                event,
                template,
                user: {
                    id: event.userId,
                    phone: "+919000000001",
                    email: "investor@example.com",
                    name: "Aditi",
                    language: template.language,
                    timezone: "Asia/Kolkata",
                    segment: "STANDARD",
                },
            });

            expect(result.renderedContent).toContain("Aditi");
            if (template.channel === "SMS") {
                expect(result.renderedContent.length).toBeLessThanOrEqual(160);
            }
        }
    });
});
