import type { FinancialEvent } from "../events/types";
import type { UserContext } from "../enrichment/types";

import { TemplateEngine } from "./engine";
import { formatCurrency } from "./helpers";
import type { TemplateDefinition } from "./registry";
import { formatSmsContent } from "./sms";

export interface PersonalizationInput {
    event: FinancialEvent;
    user: UserContext;
    template: TemplateDefinition;
    appName?: string;
}

export interface PersonalizationResult {
    context: Record<string, unknown>;
    renderedContent: string;
}

const financialFieldPattern =
    /(amount|balance|price|total|pnl|shortfall|investment|nav)$/i;

function localeForLanguage(language: string): string {
    const locales: Record<string, string> = {
        en: "en-IN",
        hi: "hi-IN",
        mr: "mr-IN",
        ta: "ta-IN",
        te: "te-IN",
    };

    return locales[language] ?? "en-IN";
}

function formatEventValues(
    event: FinancialEvent,
    locale: string,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(event)
            .filter(([key, value]) =>
                financialFieldPattern.test(key) &&
                typeof value === "number",
            )
            .map(([key, value]) => [
                key,
                formatCurrency(value, locale),
            ]),
    );
}

export class PersonalizationPipeline {
    constructor(
        private readonly engine = new TemplateEngine(),
    ) { }

    render(input: PersonalizationInput): PersonalizationResult {
        const locale = localeForLanguage(input.user.language);
        const event = input.event as unknown as Record<string, unknown>;
        const pnl = typeof event.pnl === "number" ? event.pnl : undefined;

        const context: Record<string, unknown> = {
            ...event,
            appName: input.appName ?? "ZeTheta",
            userName: input.user.name ?? "Investor",
            userLanguage: input.user.language,
            userTimezone: input.user.timezone,
            formatted: formatEventValues(input.event, locale),
            occurredAtFormatted: new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: input.user.timezone,
            }).format(new Date(input.event.occurredAt)),
            ...(pnl === undefined
                ? {}
                : {
                    isProfit: pnl >= 0,
                    pnlDirection: pnl >= 0 ? "profit" : "loss",
                }),
        };

        const renderedContent = this.engine.renderTemplate(
            input.template,
            context,
        );

        return {
            context,
            renderedContent: input.template.channel === "SMS"
                ? formatSmsContent(renderedContent)
                : renderedContent,
        };
    }
}
