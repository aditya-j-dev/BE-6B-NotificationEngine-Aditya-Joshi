import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApiServer, openApiDocument } from "..";
import type { PreferenceStore } from "../../preferences";

describe("OpenAPI and Swagger documentation", () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
        server = createApiServer({} as PreferenceStore);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

    it("publishes the versioned OpenAPI contract and Swagger UI", async () => {
        const [contract, docs, css] = await Promise.all([
            fetch(`${baseUrl}/openapi.json`), fetch(`${baseUrl}/api-docs`), fetch(`${baseUrl}/api-docs/swagger-ui.css`),
        ]);

        expect(contract.status).toBe(200);
        await expect(contract.json()).resolves.toEqual(openApiDocument);
        expect(docs.status).toBe(200);
        expect(await docs.text()).toContain("ZeTheta API Docs");
        expect(css.headers.get("content-type")).toContain("text/css");
    });
});
