import type { FinancialEvent } from "../events/types";
import type { NotificationChannel } from "../generated/prisma/enums";

import { en, hi, mr, ta, te, type EventTemplateCopy } from "./locales";
import type { TemplateDefinition } from "./registry";

export const TEMPLATE_CHANNELS: NotificationChannel[] = [
    "SMS",
    "EMAIL",
    "PUSH",
    "WHATSAPP",
    "IN_APP",
];

const localizedCopy: Record<string, EventTemplateCopy> = { en, hi, mr, ta, te };

function channelContent(channel: NotificationChannel, content: string): string {
    switch (channel) {
        case "EMAIL":
            return `ZeTheta notification\n\n${content}\n\nThank you,\nZeTheta`;
        case "PUSH":
            return `ZeTheta: ${content}`;
        case "WHATSAPP":
            return `*ZeTheta*\n\n${content}`;
        case "IN_APP":
            return content;
        case "SMS":
            return `ZeTheta: ${content}`;
    }
}

function requiredFields(content: string): string[] {
    const helperNames = new Set(["currency", "date", "truncate"]);
    const fields = new Set<string>();

    for (const match of content.matchAll(/{{\s*([^}]+)\s*}}/g)) {
        const tokens = match[1].trim().split(/\s+/);
        const field = helperNames.has(tokens[0]) ? tokens[1] : tokens[0];

        if (field && !field.includes("=")) {
            fields.add(field);
        }
    }

    return [...fields];
}

/**
 * The complete Day 4 starter set: 25 financial events × 5 channels × 5
 * languages. Database or file registries can persist these definitions later.
 */
export const STARTER_TEMPLATES: TemplateDefinition[] = Object.entries(
    localizedCopy,
).flatMap(([language, copy]) =>
    (Object.keys(copy) as FinancialEvent["eventType"][]).flatMap((eventType) =>
        TEMPLATE_CHANNELS.map((channel) => {
            const content = channelContent(channel, copy[eventType]);

            return {
                templateKey: eventType,
                eventType,
                channel,
                language,
                version: 1,
                requiredFields: requiredFields(content),
                content,
            };
        }),
    ),
);
