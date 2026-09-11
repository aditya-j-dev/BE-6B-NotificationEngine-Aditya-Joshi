import Handlebars from "handlebars";

import { registerTemplateHelpers } from "./helpers";

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
}
