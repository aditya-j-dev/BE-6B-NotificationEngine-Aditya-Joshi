import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_REQUEST_TARGET_LENGTH = 2_048;
function containsControlCharacter(value: string): boolean {
    return [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
    });
}

/** Rejects malformed or control-character-bearing URL input before any route handler uses it. */
export function validatePublicRequestTarget(request: IncomingMessage): boolean {
    const target = request.url ?? "/";
    if (target.length > MAX_REQUEST_TARGET_LENGTH) return false;
    try {
        const url = new URL(target, "http://localhost");
        return !containsControlCharacter(decodeURIComponent(url.pathname));
    } catch {
        return false;
    }
}

/** Baseline browser-facing protections for JSON APIs and the documentation UI. */
export function applyApiSecurityHeaders(response: ServerResponse): void {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'");
}

export function rejectUnsafeRequestTarget(response: ServerResponse): void {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "INVALID_REQUEST_TARGET" }));
}
