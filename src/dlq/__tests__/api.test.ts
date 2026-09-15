import { createServer, type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDlqApiHandler, type DeadLetterQueueDashboardService } from "..";

describe("DLQ dashboard API", () => {
    let server: Server;
    let baseUrl: string;
    const service = {
        list: vi.fn(async () => ({ entries: [], total: 0, limit: 50, offset: 0 })),
        retry: vi.fn(async (id: string, actor: string) => ({ id, resolved: true, resolvedBy: actor, resolutionAction: "RETRY" })),
        discard: vi.fn(async (id: string, actor: string) => ({ id, resolved: true, resolvedBy: actor, resolutionAction: "DISCARD" })),
    } as unknown as DeadLetterQueueDashboardService;

    beforeEach(async () => {
        server = createServer(createDlqApiHandler(service));
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    it("lists entries with the supplied reason filter", async () => {
        const response = await fetch(`${baseUrl}/dlq?reason=smtp&limit=20`);

        expect(response.status).toBe(200);
        expect(service.list).toHaveBeenCalledWith({ reason: "smtp", includeResolved: false, limit: 20 });
    });

    it("requires an actor and dispatches manual retry actions", async () => {
        const invalid = await fetch(`${baseUrl}/dlq/dlq-1/retry`, { method: "POST", body: "{}" });
        expect(invalid.status).toBe(400);

        const response = await fetch(`${baseUrl}/dlq/dlq-1/retry`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ actor: "ops@example.com" }),
        });
        expect(response.status).toBe(200);
        expect(service.retry).toHaveBeenCalledWith("dlq-1", "ops@example.com");
    });
});
