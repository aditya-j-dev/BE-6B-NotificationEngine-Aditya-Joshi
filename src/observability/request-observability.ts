import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Logger } from "pino";

import { respondToUnhandledError } from "./errors";
import { runWithCorrelationId } from "./context";

export type HttpRouteHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

/** Adds correlation IDs and one structured completion log to every HTTP request. */
export function observeRequest(
    request: IncomingMessage,
    response: ServerResponse,
    logger: Logger,
    handler: HttpRouteHandler,
): void {
    const header = request.headers["x-correlation-id"];
    const requestCorrelationId = typeof header === "string" && header.length > 0 ? header : randomUUID();
    const requestLogger = logger.child({ correlationId: requestCorrelationId });
    const startedAt = performance.now();
    response.setHeader("x-correlation-id", requestCorrelationId);
    response.once("finish", () => {
        requestLogger.info({
            method: request.method,
            path: new URL(request.url ?? "/", "http://localhost").pathname,
            statusCode: response.statusCode,
            durationMs: Number((performance.now() - startedAt).toFixed(2)),
        }, "HTTP request completed");
    });
    runWithCorrelationId(requestCorrelationId, () => {
        Promise.resolve(handler(request, response)).catch((error: unknown) =>
            respondToUnhandledError(response, error, requestLogger, requestCorrelationId),
        );
    });
}
