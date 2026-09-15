import http from "k6/http";
import { check, fail } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { performanceSummary } from "../lib/performance-summary.js";

// 450,000 notifications / 30 minutes = exactly 15,000 events per minute.
const MARKET_CRASH_RATE_PER_MINUTE = 15000;
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
        market_crash: {
            executor: "constant-arrival-rate",
            rate: Number(__ENV.K6_CRASH_RATE_PER_MINUTE || MARKET_CRASH_RATE_PER_MINUTE),
            timeUnit: "1m",
            duration: __ENV.K6_CRASH_DURATION || "30m",
            preAllocatedVUs: Number(__ENV.K6_CRASH_PRE_ALLOCATED_VUS || 400),
            maxVUs: Number(__ENV.K6_CRASH_MAX_VUS || 1_500),
        },
    },
};

function eventPayload() {
    const suffix = `${__VU}-${__ITER}-${Date.now()}`;
    return {
        eventId: `load-crash-${suffix}`,
        idempotencyKey: `load-crash-${suffix}`,
        eventType: "RISK-001",
        eventCategory: "risk_margin",
        userId: `load-user-${__VU}`,
        occurredAt: new Date().toISOString(),
        correlationId: `load-correlation-${suffix}`,
        source: "k6-market-crash",
        priority: "CRITICAL",
        shortfallAmount: 50000,
        deadline: "2026-12-31T15:30:00.000Z",
        liquidationRisk: "HIGH",
    };
}

export default function () {
    const response = http.post(ingestUrl, JSON.stringify(eventPayload()), {
        headers: { "content-type": "application/json" },
        tags: { scenario: "market-crash", event_type: "RISK-001", priority: "CRITICAL" },
        timeout: __ENV.K6_HTTP_TIMEOUT || "10s",
    });
    ingestLatency.add(response.timings.duration);
    const accepted = check(response, {
        "critical ingestion accepted": (result) => [200, 201, 202].includes(result.status),
    });
    ingestionFailures.add(!accepted);
    if (accepted) acceptedEvents.add(1);
}

export function handleSummary(data) {
    return performanceSummary(data, "market-crash");
}
