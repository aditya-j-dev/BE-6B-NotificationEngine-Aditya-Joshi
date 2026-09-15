import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { openApiDocument } from "./openapi";

const requireForSwaggerAssets = createRequire(__filename);
const swaggerAssetDirectory = (requireForSwaggerAssets("swagger-ui-dist/absolute-path") as () => string)();
const assetContentTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".png": "image/png",
};

function respond(response: ServerResponse, status: number, contentType: string, body: string | Buffer): void {
    response.writeHead(status, { "content-type": contentType });
    response.end(body);
}

/** Serves the OpenAPI contract and Swagger UI without adding an Express dependency. */
export function createApiDocumentationHandler() {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ZeTheta API Docs</title><link rel="stylesheet" href="/api-docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api-docs/swagger-ui-bundle.js"></script><script src="/api-docs/swagger-ui-standalone-preset.js"></script><script src="/api-docs/swagger-ui-init.js"></script></body></html>`;

    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (request.method !== "GET") {
            response.writeHead(405, { allow: "GET" });
            response.end();
            return;
        }
        if (pathname === "/openapi.json") return respond(response, 200, "application/json; charset=utf-8", JSON.stringify(openApiDocument));
        if (pathname === "/api-docs" || pathname === "/api-docs/") return respond(response, 200, "text/html; charset=utf-8", html);
        if (pathname === "/api-docs/swagger-ui-init.js") {
            return respond(response, 200, "application/javascript; charset=utf-8", "window.onload=function(){window.ui=SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger-ui',deepLinking:true,presets:[SwaggerUIBundle.presets.apis,SwaggerUIStandalonePreset],plugins:[SwaggerUIBundle.plugins.DownloadUrl],layout:'StandaloneLayout'})}");
        }
        const fileName = pathname.replace("/api-docs/", "");
        if (!fileName || fileName.includes("/") || !assetContentTypes[extname(fileName)]) {
            respond(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "NOT_FOUND" }));
            return;
        }
        try {
            respond(response, 200, assetContentTypes[extname(fileName)] ?? "application/octet-stream", await readFile(join(swaggerAssetDirectory, fileName)));
        } catch {
            respond(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "NOT_FOUND" }));
        }
    };
}
