# Day 11.6: Hot-path optimisation record

## Evidence-based changes applied before benchmark execution

| Hot path | Issue found in code review | Change | Expected effect |
| --- | --- | --- | --- |
| Event enrichment | User, preference, and channel-performance reads were executed serially for every event. | Start the three independent reads together with `Promise.all`. | Reduces enrichment waiting time from the sum of database round trips toward the slowest one. |
| Kafka consumption | Every successful message emitted several synchronous console writes, including a full routing object. | Success-path logs are now off by default and can be enabled with `DEBUG_PIPELINE_LOGS=true`. Errors remain logged. | Avoids console I/O becoming a throughput bottleneck at normal, peak, and crash rates. |

## Changes deliberately deferred pending measured data

- Consumer concurrency and Kafka fetch tuning: Day 11.7.
- PostgreSQL/Redis pool sizing: Day 11.7.
- Query-plan and index changes: Day 11.8, after `EXPLAIN ANALYZE` evidence.
- Any latency or throughput claim: only after the three k6 scenarios run against an isolated ingestion environment.

## How to validate

Run the normal, peak, and market-crash k6 scenarios. Compare the generated
P50/P95/P99 reports before and after any subsequent optimisation. Treat dropped
iterations, failure rate, Kafka lag, database connection wait time, and Redis
latency as the signals for the next change.
