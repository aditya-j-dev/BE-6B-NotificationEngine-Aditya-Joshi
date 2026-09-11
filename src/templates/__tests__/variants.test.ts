import { describe, expect, it } from "vitest";

import type { TemplateDefinition } from "../registry";
import { selectTemplateVariant } from "../variants";

const base: TemplateDefinition = {
    templateKey: "TXNX-001",
    eventType: "TXNX-001",
    channel: "SMS",
    language: "en",
    version: 1,
    content: "control",
};

describe("selectTemplateVariant", () => {
    it("uses the newest version when no experiment is active", () => {
        expect(selectTemplateVariant([
            base,
            { ...base, version: 2, content: "new" },
        ], "user-1").content).toBe("new");
    });

    it("assigns the same user to the same experiment variant", () => {
        const variants = [
            { ...base, experimentKey: "copy-test", variant: "A", variantWeight: 50 },
            { ...base, experimentKey: "copy-test", variant: "B", variantWeight: 50, content: "variant-b" },
        ];

        expect(selectTemplateVariant(variants, "user-123"))
            .toEqual(selectTemplateVariant(variants, "user-123"));
    });

    it("rejects an empty candidate list", () => {
        expect(() => selectTemplateVariant([], "user-1"))
            .toThrow("empty set");
    });
});
