import { createServer } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiRateLimiter, applyRateLimit } from "../rate-limit";
import { validatePublicRequestTarget } from "../security";

describe("API rate limiting", () => {
    let server: ReturnType<typeof createServer>;
    let baseUrl: string;

    beforeEach(async () => {
        const limiter = new ApiRateLimiter({ maxRequests: 2, windowMs: 60_000 });
        server = createServer((request, response) => {
            if (!applyRateLimit(request, response, limiter)) return;
            response.end("ok");
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

    it("returns 429 after the configured public-endpoint allowance is exhausted", async () => {
        await expect(fetch(baseUrl)).resolves.toMatchObject({ status: 200 });
        await expect(fetch(baseUrl)).resolves.toMatchObject({ status: 200 });
        const limited = await fetch(baseUrl);
        expect(limited.status).toBe(429);
        expect(limited.headers.get("retry-after")).toBe("60");
        await expect(limited.json()).resolves.toMatchObject({ error: "RATE_LIMITED" });
    });
});

describe("public request input validation", () => {
    it("rejects control characters and oversized request targets before routing", () => {
        expect(validatePublicRequestTarget({ url: "/users/user-1/preferences" } as never)).toBe(true);
        expect(validatePublicRequestTarget({ url: "/users/%00/preferences" } as never)).toBe(false);
        expect(validatePublicRequestTarget({ url: `/${"a".repeat(2_049)}` } as never)).toBe(false);
    });
});
