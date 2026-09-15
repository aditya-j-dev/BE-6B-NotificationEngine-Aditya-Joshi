# ZeTheta load tests

These k6 scripts exercise the application's **HTTP event-ingestion** boundary.
They create synthetic financial events only and use unique event and idempotency
IDs on every iteration.

## Normal load

`scenarios/normal-load.js` is calibrated to **1,389 events/minute**, equivalent
to approximately **2,000,160 events/day**. The default 10-minute duration is a
safe smoke run at the real normal-load arrival rate. Override `K6_DURATION=24h`
only in an isolated performance environment.

The repository currently publishes events directly to Kafka and does not expose
a running HTTP ingestion route. Before running the script, deploy or start the
ingress service and set its complete event-ingestion URL:

```powershell
$env:K6_INGEST_URL = 'http://localhost:<port>/<event-ingestion-route>'
$env:K6_DURATION = '10m'
k6 run load-tests/scenarios/normal-load.js
```

Never run a load scenario against production or a provider-backed notification
environment. Use synthetic users and non-production Kafka topics only.

Every run writes a JSON and Markdown benchmark report into
`load-tests/results/`. The reports include P50, P95, P99, and average ingestion
latency, accepted events, failure rate, and dropped iterations.

## Peak load

`scenarios/peak-load.js` simulates **10x normal load** at **13,889
events/minute**, which is approximately 20 million events/day. Its default
duration is five minutes. It requires the same `K6_INGEST_URL` setting as the
normal-load scenario:

```powershell
$env:K6_INGEST_URL = 'http://localhost:<port>/<event-ingestion-route>'
$env:K6_PEAK_DURATION = '5m'
k6 run load-tests/scenarios/peak-load.js
```

## Market crash

`scenarios/market-crash.js` sends **450,000 critical margin-call events in 30
minutes**: **15,000 events/minute**. It uses the `RISK-001` payload to exercise
the critical-event routing path.

```powershell
$env:K6_INGEST_URL = 'http://localhost:<port>/<event-ingestion-route>'
$env:K6_CRASH_DURATION = '30m'
k6 run load-tests/scenarios/market-crash.js
```

The specification also calls this “20x” normal load. Its stated normal-load
rate is 1,389 events/minute, so 20x would be 27,780 events/minute and would not
equal 450,000 events in 30 minutes. This scenario follows the explicit 450K in
30 minutes requirement. Set `K6_CRASH_RATE_PER_MINUTE=27780` only when you
specifically want to test the separate 20x-rate interpretation.
