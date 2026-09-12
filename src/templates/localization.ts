import type {
    TemplateDefinition,
    TemplateLookup,
    TemplateRegistry,
} from "./registry";

export const SUPPORTED_TEMPLATE_LANGUAGES = [
    "en",
    "hi",
    "mr",
    "ta",
    "te",
] as const;

export type TemplateLanguage =
    (typeof SUPPORTED_TEMPLATE_LANGUAGES)[number];

export function resolveTemplateLanguage(
    language: string | undefined,
): TemplateLanguage {
    return SUPPORTED_TEMPLATE_LANGUAGES.includes(
        language as TemplateLanguage,
    )
        ? language as TemplateLanguage
        : "en";
}

export class LocalizedTemplateRegistry implements TemplateRegistry {
    constructor(
        private readonly registry: TemplateRegistry,
    ) { }

    async find(
        lookup: TemplateLookup,
    ): Promise<TemplateDefinition | null> {
        const language = resolveTemplateLanguage(lookup.language);
        const localTemplate = await this.registry.find({
            ...lookup,
            language,
        });

        if (localTemplate || language === "en") {
            return localTemplate;
        }

        return this.registry.find({
            ...lookup,
            language: "en",
        });
    }
}
