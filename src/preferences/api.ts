import type { IncomingMessage, ServerResponse } from "node:http";

import { ZodError } from "zod";

import { PreferenceService, UserNotFoundError } from "./service";
import { updatePreferencesSchema } from "./validation";

const MAX_BODY_BYTES = 1_000_000;

class RequestBodyTooLargeError extends Error {
    constructor() {
        super("Request body exceeds 1 MB");
        this.name = "RequestBodyTooLargeError";
    }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;

        if (size > MAX_BODY_BYTES) {
            throw new RequestBodyTooLargeError();
        }

        chunks.push(buffer);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new ZodError([{
            code: "custom",
            path: [],
            message: "Request body must be valid JSON",
        }]);
    }
}

function respond(
    response: ServerResponse,
    statusCode: number,
    payload: unknown,
): void {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}

/** Creates the GET/PUT /users/:id/preferences REST endpoint. */
export function createPreferenceApiHandler(service: PreferenceService) {
    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const match = /^\/users\/([^/]+)\/preferences$/.exec(pathname);

        if (!match) {
            respond(response, 404, { error: "NOT_FOUND" });
            return;
        }

        const userId = decodeURIComponent(match[1]);

        try {
            if (request.method === "GET") {
                const preferences = await service.get(userId);
                respond(response, 200, { userId, preferences });
                return;
            }

            if (request.method === "PUT") {
                const body = updatePreferencesSchema.parse(await readJsonBody(request));
                const preferences = await service.update(userId, body.preferences);
                respond(response, 200, { userId, preferences });
                return;
            }

            response.setHeader("allow", "GET, PUT");
            respond(response, 405, { error: "METHOD_NOT_ALLOWED" });
        } catch (error) {
            if (error instanceof UserNotFoundError) {
                respond(response, 404, { error: "USER_NOT_FOUND", userId });
                return;
            }

            if (error instanceof ZodError) {
                respond(response, 400, {
                    error: "INVALID_PREFERENCE_PAYLOAD",
                    details: error.issues,
                });
                return;
            }

            if (error instanceof RequestBodyTooLargeError) {
                respond(response, 413, { error: "PAYLOAD_TOO_LARGE" });
                return;
            }

            respond(response, 500, { error: "INTERNAL_SERVER_ERROR" });
        }
    };
}
