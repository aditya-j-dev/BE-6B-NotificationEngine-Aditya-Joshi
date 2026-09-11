import { describe, expect, it } from "vitest";

import {
    formatCurrency,
    formatDate,
    TemplateEngine,
    truncateText,
} from "../index";

describe("TemplateEngine", () => {
    const engine = new TemplateEngine();

    it("renders locale-aware Indian currency", () => {
        expect(formatCurrency(123456.5)).toContain("1,23,456.5");
        expect(engine.render("{{currency amount}}", { amount: 2500 }))
            .toContain("2,500");
    });

    it("renders deterministic UTC dates", () => {
        expect(formatDate("2026-01-15T23:30:00-05:00"))
            .toBe("16 Jan 2026");
        expect(engine.render("{{date dueDate locale='en-GB'}}", {
            dueDate: "2026-01-15T00:00:00.000Z",
        })).toBe("15 Jan 2026");
    });

    it("truncates content without exceeding the requested length", () => {
        const text = "Your margin shortfall requires immediate action";
        const result = truncateText(text, 25);

        expect(result).toBe("Your margin shortfall...");
        expect(result.length).toBeLessThanOrEqual(25);
        expect(engine.render("{{truncate body 12}}", { body: text }))
            .toBe("Your marg...");
    });
});
