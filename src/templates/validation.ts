import type { TemplateDefinition } from "./registry";

export class TemplateValidationError extends Error {
    constructor(
        readonly missingFields: string[],
    ) {
        super(
            `Missing required template fields: ${missingFields.join(", ")}`,
        );
        this.name = "TemplateValidationError";
    }
}

function getValue(
    context: Record<string, unknown>,
    path: string,
): unknown {
    return path.split(".").reduce<unknown>((value, key) => {
        if (value === null || typeof value !== "object") {
            return undefined;
        }

        return (value as Record<string, unknown>)[key];
    }, context);
}

export function validateTemplateContext(
    template: TemplateDefinition,
    context: Record<string, unknown>,
): void {
    const missingFields = (template.requiredFields ?? []).filter((field) => {
        const value = getValue(context, field);

        return value === undefined || value === null || value === "";
    });

    if (missingFields.length > 0) {
        throw new TemplateValidationError(missingFields);
    }
}
