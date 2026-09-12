import Handlebars from "handlebars";

import { registerTemplateHelpers } from "./helpers";
import type { TemplateDefinition } from "./registry";
import { validateTemplateContext } from "./validation";

export class TemplateEngine {
    private readonly handlebars = Handlebars.create();

    constructor() {
        registerTemplateHelpers(this.handlebars);
    }

    render(
        template: string,
        context: Record<string, unknown>,
    ): string {
        return this.handlebars.compile(template)(context);
    }

    renderTemplate(
        template: TemplateDefinition,
        context: Record<string, unknown>,
    ): string {
        validateTemplateContext(template, context);

        return this.render(template.content, context);
    }
}
