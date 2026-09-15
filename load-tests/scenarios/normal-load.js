import http from "k6/http";
import { check, fail } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { performanceSummary } from "../lib/performance-summary.js";

// 2,000,000 events / 1,440 minutes = 1,388.89 events per minute.
const NORMAL_LOAD_RATE_PER_MINUTE = 1389;
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
        normal_load: {
            executor: "constant-arrival-rate",
            rate: Number(__ENV.K6_RATE_PER_MINUTE || NORMAL_LOAD_RATE_PER_MINUTE),
            timeUnit: "1m",
            duration: __ENV.K6_DURATION || "10m",
            preAllocatedVUs: Number(__ENV.K6_PRE_ALLOCATED_VUS || 50),
            maxVUs: Number(__ENV.K6_MAX_VUS || 200),
        },
    },
};

function eventPayload() {
    const suffix = `${__VU}-${__ITER}-${Date.now()}`;
    return {
        eventId: `load-normal-${suffix}`,
        idempotencyKey: `load-normal-${suffix}`,
        eventType: "TXNX-001",
        eventCategory: "transaction",
        userId: `load-user-${__VU}`,
        occurredAt: new Date().toISOString(),
        correlationId: `load-correlation-${suffix}`,
        source: "k6-normal-load",
        priority: "NORMAL",
        stockName: "RELIANCE",
        quantity: 1,
        price: 2500,
        total: 2500,
        portfolioImpact: 2500,
    };
}

export default function () {
    const response = http.post(ingestUrl, JSON.stringify(eventPayload()), {
        headers: { "content-type": "application/json" },
        tags: { scenario: "normal-load", event_type: "TXNX-001" },
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
    return performanceSummary(data, "normal-load");
}
