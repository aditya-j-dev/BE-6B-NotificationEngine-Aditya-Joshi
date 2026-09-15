# Day 11 performance benchmark and bottleneck analysis

## Scope and evidence

This report covers the Day 11 load-test suite, hot-path improvements, connection
tuning, and database-plan evidence. The before/after PostgreSQL plans are kept
verbatim in:

- `docs/performance/evidence/explain-before.txt`
- `docs/performance/evidence/explain-after.txt`

The local query-plan dataset contained zero matching rows. Therefore, query
times below are useful as a baseline only; they are **not** production-scale
claims and must not be presented as live throughput results.

## Load-test scenarios

| Scenario | Script | Target rate | Default duration | Execution status | P50 / P95 / P99 |
| --- | --- | ---: | ---: | --- | --- |
| Normal load | `load-tests/scenarios/normal-load.js` | 1,389 events/min | 10 min | Not run | Pending isolated HTTP ingestion target |
| Peak load | `load-tests/scenarios/peak-load.js` | 13,889 events/min | 5 min | Not run | Pending isolated HTTP ingestion target |
| Market crash | `load-tests/scenarios/market-crash.js` | 15,000 critical events/min | 30 min | Not run | Pending isolated HTTP ingestion target |

Each script writes P50, P95, P99, average latency, acceptance, failure-rate,
and dropped-iteration data to `load-tests/results/` when executed.

## Query-plan evidence

| Query | Before | After | Observed planner change | Interpretation |
| --- | ---: | ---: | --- | --- |
| Event-sourced delivery analytics | 1.066 ms | 0.159 ms | `Bitmap Index Scan` on `NotificationStateLog_terminal_createdAt_idx` | The partial terminal-state index is selected. The state-log branch was not executed because no matching notifications existed. |
| Opt-out trend analytics | 0.026 ms | 0.018 ms | `Index Scan` on `ConsentAuditLog_action_createdAt_idx` | The action/date index is selected. Both runs returned zero rows. |
| Cost analytics | 0.587 ms | 0.143 ms | Per-partition `createdAt_channel_provider` index scans | The billed-notification index family is selected. Both runs returned zero rows. |

Planning time for the first query also fell from 44.816 ms to 4.535 ms, but
this may be influenced by warmed PostgreSQL catalog caches. It must not be
attributed solely to the migration.

## Optimisations implemented

1. Enrichment now starts user, preferences, and channel-performance reads at
   the same time rather than serialising them.
2. Per-message successful Kafka consumer logging is disabled by default;
   `DEBUG_PIPELINE_LOGS=true` enables it for diagnosis.
3. The ingestion worker owns a PostgreSQL pool, a round-robin auto-pipelined
   Redis pool, and configurable Kafka partition concurrency.
4. Analytics indexes cover terminal delivery states, opt-out trends, and billed
   notification costs.

## Bottlenecks and risks

| Priority | Finding | Evidence | Required next action |
| --- | --- | --- |
| High | No runnable HTTP ingestion boundary exists in the repository. | k6 scripts require `K6_INGEST_URL`; current event publishing is Kafka-direct. | Expose or deploy a non-production HTTP ingress adapter before executing k6. |
| High | No realistic-volume performance evidence exists. | All three `EXPLAIN ANALYZE` queries returned zero rows; no k6 report files exist. | Seed an isolated test dataset and run normal, peak, then market-crash scenarios. |
| Medium | Kafka concurrency above one has no proven benefit yet. | Consumer default remains one; actual partition count and lag were not measured. | Add partitions only if load results show consumer lag, then raise `KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY` incrementally. |
| Medium | Notification queries inspect multiple monthly partitions in the captured plan. | The cost plan lists all available monthly partitions. | Recheck partition pruning with realistic dated data before altering partitioning or index order. |
| Low | Pool limits are unvalidated defaults. | PostgreSQL max 20 / Redis 8 are documented starting points. | Adjust one limit at a time using connection wait, Redis latency, and k6 percentile results. |

## Acceptance criteria for a real benchmark run

- Record the generated JSON and Markdown report for each scenario.
- No unexpected HTTP acceptance failures.
- No dropped iterations at the intended arrival rate.
- Compare P50, P95, and P99 before and after each subsequent tuning change.
- Capture Kafka consumer lag, PostgreSQL pool wait/saturation, Redis latency,
  and provider simulation failures alongside k6 output.

## Conclusion

The Day 11 performance tooling, tuning controls, and query-plan evidence are
implemented. The database changes are selected by PostgreSQL in the captured
plans. A final quantitative performance conclusion remains intentionally
pending until ZeTheta has an isolated HTTP ingestion service and a
representative-volume dataset.
