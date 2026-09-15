import type { IncomingMessage, ServerResponse } from "node:http";

import type { PrometheusMetricsService } from "./prometheus";

/** Creates the Prometheus-compatible GET /metrics endpoint. */
export function createPrometheusMetricsHandler(service: PrometheusMetricsService) {
    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (pathname !== "/metrics") {
            response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "NOT_FOUND" }));
            return;
        }
        if (request.method !== "GET") {
            response.writeHead(405, {
                allow: "GET",
                "content-type": "application/json; charset=utf-8",
            });
            response.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
            return;
        }

        try {
            const body = await service.render();
            response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
            response.end(body);
        } catch {
            response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "METRICS_UNAVAILABLE" }));
        }
    };
}
