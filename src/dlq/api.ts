import type { IncomingMessage, ServerResponse } from "node:http";

import { z, ZodError } from "zod";

import { DeadLetterQueueDashboardService, DlqEntryNotFoundError, DlqEntryResolvedError } from "./service";

const actionSchema = z.object({ actor: z.string().trim().min(1).max(100) });

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new ZodError([{ code: "custom", path: [], message: "Request body must be valid JSON" }]);
    }
}

function respond(response: ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}

/** Creates GET /dlq and POST /dlq/:id/{retry|discard} management routes. */
export function createDlqApiHandler(service: DeadLetterQueueDashboardService) {
    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const actionMatch = /^\/dlq\/([^/]+)\/(retry|discard)$/.exec(url.pathname);

        try {
            if (url.pathname === "/dlq" && request.method === "GET") {
                const limit = url.searchParams.get("limit");
                const offset = url.searchParams.get("offset");
                const result = await service.list({
                    ...(url.searchParams.get("reason") ? { reason: url.searchParams.get("reason") ?? undefined } : {}),
                    includeResolved: url.searchParams.get("includeResolved") === "true",
                    ...(limit ? { limit: Number(limit) } : {}),
                    ...(offset ? { offset: Number(offset) } : {}),
                });
                respond(response, 200, result);
                return;
            }

            if (actionMatch && request.method === "POST") {
                const body = actionSchema.parse(await readJsonBody(request));
                const entryId = decodeURIComponent(actionMatch[1] ?? "");
                const entry = actionMatch[2] === "retry"
                    ? await service.retry(entryId, body.actor)
                    : await service.discard(entryId, body.actor);
                respond(response, 200, { entry });
                return;
            }

            response.setHeader("allow", "GET, POST");
            respond(response, 404, { error: "NOT_FOUND" });
        } catch (error) {
            if (error instanceof ZodError) {
                respond(response, 400, { error: "INVALID_DLQ_ACTION", details: error.issues });
                return;
            }
            if (error instanceof DlqEntryNotFoundError) {
                respond(response, 404, { error: "DLQ_ENTRY_NOT_FOUND" });
                return;
            }
            if (error instanceof DlqEntryResolvedError) {
                respond(response, 409, { error: "DLQ_ENTRY_ALREADY_RESOLVED" });
                return;
            }
            respond(response, 500, { error: "INTERNAL_SERVER_ERROR" });
        }
    };
}
