# Day 11.7: Connection and consumer tuning

The Kafka ingestion worker now owns explicit connection resources and closes
them during shutdown.

| Component | Default | Environment variable | Tuning rule |
| --- | ---: | --- | --- |
| PostgreSQL pool maximum | 20 | `POSTGRES_POOL_MAX` | Keep total connections across all workers below the database connection limit. |
| PostgreSQL pool minimum | 2 | `POSTGRES_POOL_MIN` | Maintain a small warm baseline; do not set this above the maximum. |
| PostgreSQL idle timeout | 30,000 ms | `POSTGRES_POOL_IDLE_TIMEOUT_MS` | Release unused connections while retaining warm capacity. |
| PostgreSQL connection timeout | 5,000 ms | `POSTGRES_POOL_CONNECTION_TIMEOUT_MS` | Fail a saturated pool promptly rather than queueing indefinitely. |
| Redis pool size | 8 | `REDIS_POOL_SIZE` | Uses round-robin, auto-pipelined ioredis clients for the ingestion deduplication path. |
| Redis request retries | 3 | `REDIS_MAX_RETRIES_PER_REQUEST` | Bound retry amplification during Redis outages. |
| Kafka partition concurrency | 1 | `KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY` | Increase only after adding topic partitions and verifying consumer lag. |

Use the k6 results, database connection wait time, Redis latency, and Kafka lag
to choose non-default values. Never raise all limits together: change one
constraint at a time and compare P50/P95/P99 benchmark reports.
