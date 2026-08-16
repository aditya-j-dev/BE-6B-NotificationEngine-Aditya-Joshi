# Event Processing Pipeline

## 1. Overview

The notification engine uses an asynchronous event-driven pipeline to process
financial events and deliver notifications across multiple channels.

The pipeline separates:

- Event ingestion
- Event validation
- Event enrichment
- Notification qualification
- Preference resolution
- Channel routing
- Delivery processing
- Provider communication
- Retry and failure handling

The architecture uses Kafka as the primary event bus and RabbitMQ for
delivery-oriented processing.

---

## 2. End-to-End Pipeline

```text
Financial Event Producer
          |
          v
       Kafka
          |
          v
   Kafka Consumer
          |
          v
   Event Validation
          |
          v
   Event Enrichment
          |
          v
 Preference Resolution
          |
          v
   Qualification
          |
          +------ Not Eligible ------> Stop
          |
          v
 Frequency / Policy Checks
          |
          v
 Personalisation
          |
          v
 Template Rendering
          |
          v
 Compliance Checks
          |
          v
 Channel Routing
          |
          v
 Provider Selection
          |
          v
 Deduplication / Idempotency
          |
          v
      RabbitMQ
          |
      +---+---+
      |       |
      v       v
  Critical   Normal
  Workers    Workers
      |       |
      +---+---+
          |
          v
     Provider API
          |
       +--+--+
       |     |
       v     v
    Success Failure
       |     |
       v     v
   Delivered Retry
             |
             v
            DLQ
```

## 3. Stage 1 — Event Ingestion

Financial systems generate events such as:

- Transaction executions
- Transaction failures
- Margin calls
- SIP reminders
- Price alerts
- Regulatory notices
- Account restrictions
- Market events

These events are published to Apache Kafka.

Kafka acts as the primary event bus and decouples event producers from
notification consumers.

```text
Financial System
       |
       | Financial Event
       v
     Kafka
```

## 4. Kafka Topics

The system uses separate Kafka topics for different classes of traffic.

### Normal Events

`notification-events`

- Used for normal notification events.
- The topic is partitioned using a hash of user_id to distribute processing
while maintaining ordering for a given user where applicable.

### Critical Events

`notification-critical`

- Used for high-priority events such as:
	- Margin calls
	- Regulatory notifications
	- Critical account events
- Critical events use dedicated consumer groups and resources.

### Dead Letter Topic

`notification-dlq`

- Used for Kafka-level events that cannot be successfully processed according to the configured failure strategy.

## 5. Stage 2 — Kafka Consumer

Kafka consumers read events from the appropriate topic using consumer groups.

The consumer is responsible for:

- Reading events
- Deserializing event payloads
- Validating message metadata
- Maintaining offsets
- Passing valid events to the processing pipeline

The implementation uses manual offset management to support at-least-once
processing.
```text
Kafka Topic
     |
     v
Consumer Group
     |
     v
Kafka Consumer
```

## 6. Stage 3 — Event Validation
Every incoming event is validated against its expected event schema.
Validation checks include:
- Event type
- Required fields
- Data types
- Event timestamp
- User identifier
- Event identifier
- Event-specific payload

Invalid events are rejected according to the error-handling strategy.
```text
Incoming Event
      |
      v
   Validator
      |
   +--+--+
   |     |
 Valid  Invalid
   |     |
   v     v
Process  Error Handling
```
The project uses strict TypeScript event models together with schema
validation for the 25+ supported event types.

## 7. Stage 4 — Event Enrichment
After validation, the event is enriched with contextual information required
for notification processing.
Possible enrichment data includes:
- User information
- User preferences
- Event metadata
- Notification priority
- Applicable channels
- Language
- User timezone

```text
Validated Event
      |
      v
Event Enrichment
      |
      +-- User Context
      +-- Preferences
      +-- Priority
      +-- Channels
      +-- Language
      +-- Timezone
      |
      v
Enriched Event
```

## 8. Stage 5 — Preference Resolution
The system resolves the user's notification preferences.
The preference hierarchy is:

```text
System Defaults
      |
      v
Segment Preferences
      |
      v
User Preferences
      |
      v
Regulatory Override
```
Frequently accessed preferences are cached in Redis.
PostgreSQL remains the persistent source of truth.
```text
              Preference Request
                     |
             +-------+-------+
             |               |
             v               v
           Redis         PostgreSQL
             |               |
             +-------+-------+
                     |
                     v
             Resolved Preference
```

## 9. Stage 6 — Notification Qualification
The system determines whether the event should result in a notification.
Qualification considers:
- Event type
- User eligibility
- User preferences
- Notification priority
- Regulatory requirements
- Frequency policies
- Quiet hours
The objective is to avoid unnecessary notification processing.
```text
Event
 |
 v
Qualification
 |
 +---- Not Eligible ----> Stop
 |
 v
Eligible
```
This prevents the system from becoming a "fire hose" that sends every event
directly to users.

## 10. Stage 7 — Frequency and Policy Checks
Eligible notifications are checked against notification policies.
The system supports:
- Global daily caps
- Per-channel daily caps
- Per-category hourly caps
- Same-type cooldowns
- Quiet hours
Redis is used for fast counter operations and TTL-based state.
```text
Eligible Notification
        |
        v
 Frequency Checks
        |
        v
 Quiet Hours
        |
     +--+--+
     |     |
  Allowed  Blocked
     |     |
     v     v
Continue  Delay / Stop
```
Low-priority notifications may be delayed or aggregated when appropriate.

## 11. Stage 8 — Personalisation
The personalisation stage resolves user-specific data required by the
notification.
Possible inputs include:
- User profile
- User preferences
- Product usage
- Behavioural features
- Language
- Channel preferences
```text
User Context
     +
Event Data
     +
User Features
     |
     v
Personalisation
     |
     v
Personalised Data
```

## 12. Stage 9 — Template Rendering
The template engine renders the notification using Handlebars.
Templates support:
- Personalisation
- Localisation
- Versioning
- Channel-specific content
- Formatting helpers
Example:
```text
Hello {{userName}},

Your order {{orderId}} has been executed at
{{executionPrice}}.
```

```text
The template registry can select the appropriate template based on:
Event Type
+
Channel
+
Language
+
Template Version
```

## 13. Stage 10 — Compliance
Compliance checks are applied before delivery.
For SMS notifications, the final DND check is performed immediately before
dispatch rather than relying only on an earlier cached decision.
The compliance layer also handles:
- Transactional/promotional classification
- Consent
- DND status
- Audit information

```text
Rendered Notification
        |
        v
   Compliance
        |
     +--+--+
     |     |
   Pass   Block
     |     |
     v     v
Continue  Stop / Audit
```

## 14. Stage 11 — Channel Routing
The routing engine determines the appropriate notification channel.
Possible channels:
- SMS
- Email
- Push
- WhatsApp
- In-app

Routing considers:
- Event priority
- User preferences
- Channel availability
- Channel scoring
- Compliance
- Provider health


For events requiring multiple channels, the system can support multi-channel
fan-out.

```text
              Notification
                   |
                   v
             Routing Engine
                   |
       +-----------+-----------+
       |           |           |
       v           v           v
      SMS        Email        Push
       |
       +------ WhatsApp
       |
       +------ In-App
```

## 15. Stage 12 — Provider Selection
After selecting the channel, the system selects the appropriate provider.
Example:
```text
SMS
 |
 +-- MSG91
 |
 +-- Twilio
```
    
Provider selection considers provider health and availability.
If the primary provider is unhealthy, the circuit breaker and failover
strategy can select a secondary provider.

## 16. Stage 13 — Idempotency and Deduplication
The system prevents duplicate notification processing.
Duplicates can occur because of:
- Event retries
- Kafka consumer retries
- Provider failover
- Network failures
- At-least-once delivery

Redis is used for TTL-based idempotency keys.

```text
Event
 |
 v
Idempotency Check
 |
 +---- Already Processed ----> Stop
 |
 v
New Event
 |
 v
Continue
```

This prevents the same notification from being delivered multiple times.

## 17. Stage 14 — RabbitMQ Delivery Queue
Once a notification has passed processing and routing, it is published to
RabbitMQ.
RabbitMQ handles:
-   Delivery routing
- Priority
- Message acknowledgement
- Retry handling
- Dead Letter Queue processing

```text
Processed Notification
        |
        v
     RabbitMQ
        |
    +---+---+
    |       |
    v       v
Critical  Normal
 Queue     Queue
```

Kafka is therefore responsible for event streaming, while RabbitMQ is
responsible for delivery-oriented processing.

## 18. Stage 15 — Critical and Normal Workers
Critical and normal notifications use separate processing resources.

```text
                    RabbitMQ
                       |
              +--------+--------+
              |                 |
              v                 v
       Critical Queue      Normal Queue
              |                 |
              v                 v
       Critical Workers   Normal Workers
```

Critical notifications include:
- Margin calls
- Regulatory notices
- Critical account events

Normal notifications include high-volume events such as:
- Price alerts
- Market updates
- Engagement notifications

This prevents low-priority traffic from delaying critical notifications.

## 19. Stage 16 — Provider Delivery
Delivery workers call external notification providers.

```text
Delivery Worker
      |
      v
Provider API
      |
   +--+--+
   |     |
Success Failure
   |     |
   v     v
Sent    Retry
```

Provider calls are asynchronous and do not block the main event-processing
pipeline.
Provider rate limits must be respected.

## 20. Stage 17 — Retry Strategy
Failed delivery attempts use controlled retries.
The retry strategy uses:
- Exponential backoff
- Jitter
- Maximum retry attempts

```text
Provider Failure
       |
       v
     Retry
       |
       v
Exponential Backoff
       |
       v
     Retry
       |
       +---- Success ----> Delivered
       |
       +---- Max Attempts
                 |
                 v
                DLQ
```

Immediate and unlimited retries are avoided to prevent retry storms.

## 21. Stage 18 — Dead Letter Queue
Messages that cannot be processed after the configured retry limit are moved
to a Dead Letter Queue.

Examples include:

- SMS that cannot be delivered after repeated retries
- Push notification to an expired device token
- Permanently bounced email

DLQ entries should contain sufficient information for investigation and
remediation.

```text
Failed Message
      |
      v
Maximum Retries
      |
      v
     DLQ
      |
      +---- Monitoring
      |
      +---- Investigation
      |
      +---- Remediation / Replay
```

## 22. Notification Lifecycle
The processing pipeline is connected to the notification lifecycle state
machine.

```text
CREATED
   |
   v
ENRICHED
   |
   v
ROUTED
   |
   v
QUEUED
   |
   v
SENT
   |
   v
DELIVERED
   |
   v
READ
```

Possible alternate states include:

- CAPPED
- QUIET
- DND
- FAILED
- RETRYING
- BOUNCED
- DLQ

Every state transition must be recorded with:

- Timestamp
- Actor / system component
- Relevant metadata
- Failure reason where applicable
- Retry count where applicable
- Provider response where applicable


## 23. Critical Event Flow
Critical events use a dedicated processing path.

```text
Critical Financial Event
          |
          v
notification-critical
          |
          v
Critical Consumer Group
          |
          v
Critical Processing
          |
          v
Critical Routing
          |
          v
Priority Delivery Queue
          |
          v
Critical Delivery Worker
          |
          v
Provider
```

This protects critical notifications during large traffic spikes.
For example, a market event may generate a very large number of price alerts
while margin calls still require low-latency processing.

## 24. Provider Failure and Failover
Provider failures are handled through circuit breakers and fallback providers.

```text
Primary Provider
       |
       v
 Circuit Breaker
       |
   +---+---+
   |       |
Healthy  Unhealthy
   |       |
   v       v
 Send   Secondary
        Provider
```

If the entire channel becomes unavailable, the routing engine may select a
fallback channel when permitted by:

- User preferences
- Notification priority
- Compliance rules

## 25. Observability
The pipeline uses correlation IDs to trace notifications from ingestion to
delivery confirmation.


The correlation ID is generated during event ingestion and propagated through
the processing pipeline.
```text
Event
 |
 +-- correlation_id
       |
       +-- Kafka
       +-- Processing
       +-- RabbitMQ
       +-- Delivery Worker
       +-- Provider
       +-- Notification Record
```
The system should expose metrics including:

- Events received
- Notification deliveries
- Delivery latency
- Frequency-cap hits
- DND blocks
- DLQ depth
- Retry counts
- Kafka consumer lag
- Provider circuit state


## 26. Pipeline Design Principles
- The pipeline follows these principles:
    - Financial events are processed asynchronously.
    - Kafka is used for primary event streaming.
    - Critical events use dedicated processing resources.
    - Events are validated before processing.
    - User context and preferences are resolved during enrichment.
    - Notifications are qualified before expensive delivery processing.
    - Redis provides low-latency state and counters.
    - RabbitMQ handles delivery-oriented routing and queues.
    - External provider calls are asynchronous.
    - DND checks are performed as close as possible to SMS dispatch.
    - Duplicate processing is prevented using idempotency keys.
    - Failed deliveries use controlled retries with backoff and jitter.
    - Permanently failed messages are moved to the DLQ.
    - Correlation IDs provide end-to-end traceability.