import { createHash } from "node:crypto";

import type { TemplateDefinition } from "./registry";

export function selectTemplateVariant(
    templates: TemplateDefinition[],
    stableUserKey: string,
): TemplateDefinition {
    if (templates.length === 0) {
        throw new Error("Cannot select a template from an empty set");
    }

    const experimentTemplates = templates.filter(
        (template) => template.experimentKey && template.variant,
    );

    if (experimentTemplates.length === 0) {
        return [...templates].sort((a, b) => b.version - a.version)[0]!;
    }

    const experimentKey = experimentTemplates[0]!.experimentKey!;
    const candidates = experimentTemplates.filter(
        (template) => template.experimentKey === experimentKey,
    );
    const totalWeight = candidates.reduce(
        (total, template) => total + (template.variantWeight ?? 100),
        0,
    );
    const bucket = createHash("sha256")
        .update(`${experimentKey}:${stableUserKey}`)
        .digest()
        .readUInt32BE(0) % totalWeight;

    let cursor = 0;
    for (const candidate of candidates) {
        cursor += candidate.variantWeight ?? 100;
        if (bucket < cursor) {
            return candidate;
        }
    }

    return candidates[candidates.length - 1]!;
}
