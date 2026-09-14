import type { IncomingMessage, ServerResponse } from "node:http";

import { z, ZodError } from "zod";

import { DeliveryAcknowledgementService } from "./acknowledgements";

const MAX_BODY_BYTES = 1_000_000;

const callbackSchema = z.object({
    callbackId: z.string().min(1).max(191),
    provider: z.string().min(1).max(50),
    externalId: z.string().min(1).max(100),
    status: z.enum(["QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "BOUNCED"]),
    occurredAt: z.coerce.date(),
    providerStatus: z.string().min(1).max(50),
    payload: z.record(z.string(), z.unknown()).optional(),
});

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_BODY_BYTES) {
            throw new Error("PAYLOAD_TOO_LARGE");
        }
        chunks.push(buffer);
    }

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

/** Creates the POST /provider-callbacks endpoint for normalized provider callbacks. */
export function createDeliveryAcknowledgementApiHandler(service: DeliveryAcknowledgementService) {
    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (pathname !== "/provider-callbacks") {
            respond(response, 404, { error: "NOT_FOUND" });
            return;
        }

        if (request.method !== "POST") {
            response.setHeader("allow", "POST");
            respond(response, 405, { error: "METHOD_NOT_ALLOWED" });
            return;
        }

        try {
            const callback = callbackSchema.parse(await readJsonBody(request));
            const result = await service.record(callback);
            respond(response, result.outcome === "UNMATCHED" ? 202 : 200, result);
        } catch (error) {
            if (error instanceof ZodError) {
                respond(response, 400, { error: "INVALID_CALLBACK_PAYLOAD", details: error.issues });
                return;
            }

            if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
                respond(response, 413, { error: "PAYLOAD_TOO_LARGE" });
                return;
            }

            respond(response, 500, { error: "INTERNAL_SERVER_ERROR" });
        }
    };
}
