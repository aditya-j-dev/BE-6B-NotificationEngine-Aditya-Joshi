import { describe, expect, it } from "vitest";

import {
    LocalizedTemplateRegistry,
    resolveTemplateLanguage,
    type TemplateDefinition,
} from "../index";

const englishTemplate: TemplateDefinition = {
    templateKey: "TXNX-001",
    eventType: "TXNX-001",
    channel: "SMS",
    language: "en",
    version: 1,
    content: "Order executed",
};

describe("template localization", () => {
    it("recognizes all five supported languages", () => {
        expect(resolveTemplateLanguage("en")).toBe("en");
        expect(resolveTemplateLanguage("hi")).toBe("hi");
        expect(resolveTemplateLanguage("mr")).toBe("mr");
        expect(resolveTemplateLanguage("ta")).toBe("ta");
        expect(resolveTemplateLanguage("te")).toBe("te");
    });

    it("uses English for an unsupported language", () => {
        expect(resolveTemplateLanguage("bn")).toBe("en");
    });

    it("falls back to English when a localized template is absent", async () => {
        const calls: string[] = [];
        const registry = new LocalizedTemplateRegistry({
            find: async (lookup) => {
                calls.push(lookup.language);
                return lookup.language === "en" ? englishTemplate : null;
            },
        });

        await expect(registry.find({
            templateKey: "TXNX-001",
            channel: "SMS",
            language: "mr",
        })).resolves.toEqual(englishTemplate);

        expect(calls).toEqual(["mr", "en"]);
    });
});
