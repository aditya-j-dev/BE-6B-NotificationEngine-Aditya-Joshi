export const MAX_SMS_LENGTH = 160;

const urlPattern = /https?:\/\/[^\s<>"']+/gi;

export class SmsContentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SmsContentError";
    }
}

function truncateAtWordBoundary(text: string, maximumLength: number): string {
    if (text.length <= maximumLength) {
        return text;
    }

    if (maximumLength <= 3) {
        return "...".slice(0, maximumLength);
    }

    const shortened = text.slice(0, maximumLength - 3);
    const boundary = shortened.lastIndexOf(" ");

    return `${boundary > 0 ? shortened.slice(0, boundary) : shortened}...`;
}

/**
 * Makes rendered SMS content fit a single 160-character message. When a
 * message has to be shortened, links are moved to the end and never split.
 */
export function formatSmsContent(content: string): string {
    if (content.length <= MAX_SMS_LENGTH) {
        return content;
    }

    const links = content.match(urlPattern) ?? [];

    if (links.length === 0) {
        return truncateAtWordBoundary(content, MAX_SMS_LENGTH);
    }

    const linkSuffix = links.join(" ");

    if (linkSuffix.length > MAX_SMS_LENGTH) {
        throw new SmsContentError(
            "SMS links exceed the 160-character message limit",
        );
    }

    const message = content
        .replace(urlPattern, "")
        .replace(/\s+/g, " ")
        .trim();

    if (message.length === 0) {
        return linkSuffix;
    }

    const separator = " … ";
    const availableMessageLength = MAX_SMS_LENGTH - linkSuffix.length - separator.length;

    if (availableMessageLength <= 0) {
        return linkSuffix;
    }

    return `${truncateAtWordBoundary(message, availableMessageLength)}${separator}${linkSuffix}`;
}
