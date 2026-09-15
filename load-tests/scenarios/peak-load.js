import http from "k6/http";
import { check, fail } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { performanceSummary } from "../lib/performance-summary.js";

// 10 x normal load: 10 x 2,000,000 events/day = ~13,889 events/minute.
const PEAK_LOAD_RATE_PER_MINUTE = 13889;
const ingestLatency = new Trend("zetheta_ingest_latency", true);
const ingestionFailures = new Rate("zetheta_ingest_failures");
const acceptedEvents = new Counter("zetheta_events_accepted");

const ingestUrl = __ENV.K6_INGEST_URL;
if (!ingestUrl) {
    fail("K6_INGEST_URL is required. Set it to the complete HTTP event-ingestion route before running this scenario.");
}

export const options = {
    summaryTrendStats: ["avg", "min", "med", "max", "p(50)", "p(95)", "p(99)"],
    scenarios: {
        peak_load: {
            executor: "constant-arrival-rate",
            rate: Number(__ENV.K6_PEAK_RATE_PER_MINUTE || PEAK_LOAD_RATE_PER_MINUTE),
            timeUnit: "1m",
            duration: __ENV.K6_PEAK_DURATION || "5m",
            preAllocatedVUs: Number(__ENV.K6_PEAK_PRE_ALLOCATED_VUS || 250),
            maxVUs: Number(__ENV.K6_PEAK_MAX_VUS || 1_200),
        },
    },
};

function eventPayload() {
    const suffix = `${__VU}-${__ITER}-${Date.now()}`;
    return {
        eventId: `load-peak-${suffix}`,
        idempotencyKey: `load-peak-${suffix}`,
        eventType: "MKTX-001",
        eventCategory: "market_price",
        userId: `load-user-${__VU}`,
        occurredAt: new Date().toISOString(),
        correlationId: `load-correlation-${suffix}`,
        source: "k6-peak-load",
        priority: "NORMAL",
        stock: "RELIANCE",
        targetPrice: 2500,
        currentPrice: 2525,
        direction: "UP",
    };
}

export default function () {
    const response = http.post(ingestUrl, JSON.stringify(eventPayload()), {
        headers: { "content-type": "application/json" },
        tags: { scenario: "peak-load", event_type: "MKTX-001" },
        timeout: __ENV.K6_HTTP_TIMEOUT || "10s",
    });
    ingestLatency.add(response.timings.duration);
    const accepted = check(response, {
        "ingestion accepted": (result) => [200, 201, 202].includes(result.status),
    });
    ingestionFailures.add(!accepted);
    if (accepted) acceptedEvents.add(1);
}

export function handleSummary(data) {
    return performanceSummary(data, "peak-load");
}
