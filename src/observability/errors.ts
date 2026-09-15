import type { ServerResponse } from "node:http";

import type { Logger } from "pino";

export type ErrorClassification = "VALIDATION" | "PERMANENT" | "TRANSIENT" | "UNEXPECTED";

export function classifyError(error: unknown): ErrorClassification {
    const message = error instanceof Error ? error.message : String(error);
    const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (error instanceof Error && (error.name === "ZodError" || message.startsWith("INVALID_"))) return "VALIDATION";
    if (/not found|unsupported|permanent|invalid/i.test(message) || code === "P2002") return "PERMANENT";
    if (/timeout|temporar|connection|unavailable|ECONN|P1001/i.test(`${message} ${code}`)) return "TRANSIENT";
    return "UNEXPECTED";
}

export function respondToUnhandledError(response: ServerResponse, error: unknown, logger: Logger, correlationId: string): void {
    const classification = classifyError(error);
    const statusCode = classification === "VALIDATION" ? 400
        : classification === "PERMANENT" ? 422
            : classification === "TRANSIENT" ? 503 : 500;
    logger.error({ err: error, classification, correlationId }, "Unhandled API error");
    if (response.headersSent) {
        response.end();
        return;
    }
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "REQUEST_FAILED", classification, correlationId }));
}
