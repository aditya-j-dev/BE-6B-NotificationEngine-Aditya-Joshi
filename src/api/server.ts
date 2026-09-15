import { createServer, type Server } from "node:http";

import {
    createPreferenceApiHandler,
    type PreferenceAnalytics,
    PreferenceService,
    type PreferenceCache,
    type PreferenceStore,
} from "../preferences";
import {
    createDeliveryAcknowledgementApiHandler,
    DeliveryAcknowledgementService,
} from "../delivery";
import { createDlqApiHandler, DeadLetterQueueDashboardService } from "../dlq";
import {
    AnalyticsApiService,
    createAnalyticsDashboardApiHandler,
    createPrometheusMetricsHandler,
    PrometheusMetricsService,
} from "../analytics";
import {
    applicationLogger,
    createHealthApiHandler,
    HealthService,
    observeRequest,
} from "../observability";
import type { Logger } from "pino";

/** Creates the ZeTheta HTTP server with the currently available API routes. */
export function createApiServer(
    store: PreferenceStore,
    preferenceCache?: PreferenceCache,
    preferenceAnalytics?: PreferenceAnalytics,
    deliveryAcknowledgements?: DeliveryAcknowledgementService,
    deadLetterQueueDashboard?: DeadLetterQueueDashboardService,
    prometheusMetrics?: PrometheusMetricsService,
    analyticsDashboard?: AnalyticsApiService,
    healthService?: HealthService,
    logger: Logger = applicationLogger,
): Server {
    const preferenceHandler = createPreferenceApiHandler(
        new PreferenceService(store, preferenceCache, preferenceAnalytics),
    );
    const acknowledgementHandler = deliveryAcknowledgements
        ? createDeliveryAcknowledgementApiHandler(deliveryAcknowledgements)
        : undefined;
    const dlqHandler = deadLetterQueueDashboard
        ? createDlqApiHandler(deadLetterQueueDashboard)
        : undefined;
    const metricsHandler = prometheusMetrics
        ? createPrometheusMetricsHandler(prometheusMetrics)
        : undefined;
    const analyticsDashboardHandler = analyticsDashboard
        ? createAnalyticsDashboardApiHandler(analyticsDashboard)
        : undefined;
    const healthHandler = healthService ? createHealthApiHandler(healthService) : undefined;

    return createServer((request, response) => {
        observeRequest(request, response, logger, async () => {
            const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
            if (pathname.startsWith("/health") && healthHandler) return healthHandler(request, response);
            if (pathname === "/provider-callbacks" && acknowledgementHandler) return acknowledgementHandler(request, response);
            if (pathname === "/dlq" || pathname.startsWith("/dlq/")) {
                if (dlqHandler) return dlqHandler(request, response);
                response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
                response.end(JSON.stringify({ error: "NOT_FOUND" }));
                return;
            }
            if (pathname === "/metrics" && metricsHandler) return metricsHandler(request, response);
            if (pathname.startsWith("/analytics/") && analyticsDashboardHandler) return analyticsDashboardHandler(request, response);
            return preferenceHandler(request, response);
        });
    });
}
