import type Handlebars from "handlebars";

function toFiniteNumber(value: unknown): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        throw new TypeError("Expected a finite numeric template value");
    }

    return numericValue;
}

export function formatCurrency(
    value: unknown,
    locale = "en-IN",
    currency = "INR",
): string {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(toFiniteNumber(value));
}

export function formatDate(
    value: unknown,
    locale = "en-IN",
): string {
    const date = new Date(String(value));

    if (Number.isNaN(date.getTime())) {
        throw new TypeError("Expected an ISO-compatible date template value");
    }

    return new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
}

export function truncateText(
    value: unknown,
    maximumLength: unknown,
    suffix = "...",
): string {
    const text = String(value);
    const limit = Math.floor(toFiniteNumber(maximumLength));

    if (limit <= suffix.length) {
        throw new RangeError("Maximum length must exceed the truncation suffix");
    }

    if (text.length <= limit) {
        return text;
    }

    return `${text.slice(0, limit - suffix.length).trimEnd()}${suffix}`;
}

export function registerTemplateHelpers(
    handlebars: typeof Handlebars,
): void {
    handlebars.registerHelper(
        "currency",
        (value: unknown, options: Handlebars.HelperOptions) =>
            formatCurrency(
                value,
                options.hash.locale as string | undefined,
                options.hash.currency as string | undefined,
            ),
    );

    handlebars.registerHelper(
        "date",
        (value: unknown, options: Handlebars.HelperOptions) =>
            formatDate(value, options.hash.locale as string | undefined),
    );

    handlebars.registerHelper(
        "truncate",
        (value: unknown, maximumLength: unknown) =>
            truncateText(value, maximumLength),
    );
}
