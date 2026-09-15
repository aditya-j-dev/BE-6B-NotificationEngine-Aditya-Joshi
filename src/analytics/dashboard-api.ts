import type { IncomingMessage, ServerResponse } from "node:http";

import type { NotificationChannel } from "../generated/prisma/enums";

import { AnalyticsApiService } from "./service";
import { createMockDashboardDataset } from "./mock-dashboard";

const CHANNELS: NotificationChannel[] = ["SMS", "EMAIL", "PUSH", "WHATSAPP", "IN_APP"];

function respond(response: ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}

function dateParameter(value: string | null, name: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) throw new Error(`INVALID_${name.toUpperCase()}`);
    return date;
}

function channelParameter(value: string | null): NotificationChannel | undefined {
    if (!value) return undefined;
    if (!(CHANNELS as string[]).includes(value)) throw new Error("INVALID_CHANNEL");
    return value as NotificationChannel;
}

/** Creates dashboard API routes for delivery rates, channel performance, and opt-out trends. */
export function createAnalyticsDashboardApiHandler(service: AnalyticsApiService) {
    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (request.method !== "GET") {
            response.setHeader("allow", "GET");
            respond(response, 405, { error: "METHOD_NOT_ALLOWED" });
            return;
        }

        try {
            const from = dateParameter(url.searchParams.get("from"), "from");
            const to = dateParameter(url.searchParams.get("to"), "to");
            if (from && to && from > to) {
                respond(response, 400, { error: "INVALID_DATE_RANGE" });
                return;
            }

            if (url.pathname === "/analytics/delivery-rates") {
                const channel = channelParameter(url.searchParams.get("channel"));
                const metrics = await service.deliveryRates({
                    ...(from ? { from } : {}),
                    ...(to ? { to } : {}),
                    ...(channel ? { channel } : {}),
                });
                respond(response, 200, { metrics });
                return;
            }
            if (url.pathname === "/analytics/channel-performance") {
                const channel = channelParameter(url.searchParams.get("channel"));
                const metrics = await service.channelPerformance(channel ? [channel] : CHANNELS);
                respond(response, 200, { metrics });
                return;
            }
            if (url.pathname === "/analytics/opt-out-trends") {
                const trends = await service.optOutTrends(from, to);
                respond(response, 200, { trends });
                return;
            }
            if (url.pathname === "/analytics/costs") {
                const channel = channelParameter(url.searchParams.get("channel"));
                const provider = url.searchParams.get("provider") || undefined;
                const metrics = await service.costs({
                    ...(from ? { from } : {}),
                    ...(to ? { to } : {}),
                    ...(channel ? { channel } : {}),
                    ...(provider ? { provider } : {}),
                });
                respond(response, 200, { metrics });
                return;
            }
            if (url.pathname === "/analytics/mock-dashboard") {
                respond(response, 200, { dashboard: createMockDashboardDataset() });
                return;
            }
            respond(response, 404, { error: "NOT_FOUND" });
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("INVALID_")) {
                respond(response, 400, { error: error.message });
                return;
            }
            respond(response, 500, { error: "ANALYTICS_UNAVAILABLE" });
        }
    };
}
