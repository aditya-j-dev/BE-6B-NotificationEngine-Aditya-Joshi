function rounded(value) {
    return typeof value === "number" ? Number(value.toFixed(2)) : null;
}

function trendValues(data, metricName) {
    return data.metrics[metricName]?.values ?? {};
}

/** Builds machine-readable and reviewer-friendly P50/P95/P99 benchmark output. */
export function performanceSummary(data, scenario) {
    const latency = trendValues(data, "zetheta_ingest_latency");
    const failures = trendValues(data, "zetheta_ingest_failures");
    const accepted = trendValues(data, "zetheta_events_accepted");
    const checks = trendValues(data, "checks");
    const summary = {
        scenario,
        generatedAt: new Date().toISOString(),
        latencyMs: {
            p50: rounded(latency["p(50)"]),
            p95: rounded(latency["p(95)"]),
            p99: rounded(latency["p(99)"]),
            average: rounded(latency.avg),
        },
        acceptedEvents: accepted.count ?? 0,
        failureRate: rounded(failures.rate ?? failures.value),
        successfulChecks: checks.passes ?? 0,
        failedChecks: checks.fails ?? 0,
        droppedIterations: trendValues(data, "dropped_iterations").count ?? 0,
    };
    const markdown = [
        `# ${scenario} benchmark`,
        "",
        `Generated: ${summary.generatedAt}`,
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        `| P50 ingestion latency | ${summary.latencyMs.p50 ?? "n/a"} ms |`,
        `| P95 ingestion latency | ${summary.latencyMs.p95 ?? "n/a"} ms |`,
        `| P99 ingestion latency | ${summary.latencyMs.p99 ?? "n/a"} ms |`,
        `| Average ingestion latency | ${summary.latencyMs.average ?? "n/a"} ms |`,
        `| Accepted events | ${summary.acceptedEvents} |`,
        `| Failure rate | ${summary.failureRate ?? "n/a"} |`,
        `| Dropped iterations | ${summary.droppedIterations} |`,
    ].join("\n");
    return {
        [`load-tests/results/${scenario}-summary.json`]: JSON.stringify(summary, null, 2),
        [`load-tests/results/${scenario}-summary.md`]: `${markdown}\n`,
    };
}
