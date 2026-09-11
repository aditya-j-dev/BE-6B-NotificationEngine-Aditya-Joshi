import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { NotificationChannel } from "../generated/prisma/enums";

export interface TemplateDefinition {
    templateKey: string;
    eventType: string;
    channel: NotificationChannel;
    language: string;
    version: number;
    experimentKey?: string | null;
    variant?: string | null;
    variantWeight?: number;
    content: string;
}

export interface TemplateLookup {
    templateKey: string;
    channel: NotificationChannel;
    language: string;
}

export interface TemplateRegistry {
    find(lookup: TemplateLookup): Promise<TemplateDefinition | null>;
}

interface TemplateDatabaseStore {
    template: {
        findFirst(args: {
            where: {
                templateKey: string;
                channel: NotificationChannel;
                language: string;
                active: boolean;
            };
            orderBy: { version: "desc" };
        }): Promise<TemplateDefinition | null>;
    };
}

export class DatabaseTemplateRegistry implements TemplateRegistry {
    constructor(
        private readonly store: TemplateDatabaseStore,
    ) { }

    async find(
        lookup: TemplateLookup,
    ): Promise<TemplateDefinition | null> {
        return this.store.template.findFirst({
            where: {
                templateKey: lookup.templateKey,
                channel: lookup.channel,
                language: lookup.language,
                active: true,
            },
            orderBy: { version: "desc" },
        });
    }
}

export class FileTemplateRegistry implements TemplateRegistry {
    constructor(
        private readonly rootDirectory: string,
    ) { }

    async find(
        lookup: TemplateLookup,
    ): Promise<TemplateDefinition | null> {
        const filename = [
            lookup.templateKey,
            lookup.channel.toLowerCase(),
            lookup.language,
        ].join(".") + ".json";

        try {
            const content = await readFile(
                join(this.rootDirectory, filename),
                "utf8",
            );

            return JSON.parse(content) as TemplateDefinition;
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                return null;
            }

            throw error;
        }
    }
}

export class CompositeTemplateRegistry implements TemplateRegistry {
    constructor(
        private readonly registries: TemplateRegistry[],
    ) { }

    async find(
        lookup: TemplateLookup,
    ): Promise<TemplateDefinition | null> {
        for (const registry of this.registries) {
            const template = await registry.find(lookup);

            if (template) {
                return template;
            }
        }

        return null;
    }
}
