# Day 1 Architecture Review

## 1. Architecture Summary

The Event-Driven Notification Engine uses an asynchronous event-driven
architecture for processing financial events and delivering notifications
through multiple channels.

The architecture consists of:

- Apache Kafka for event ingestion and event streaming
- Event processing and qualification services
- Redis for caching and fast-changing state
- PostgreSQL for persistent storage
- RabbitMQ for delivery-oriented messaging
- Critical and normal notification processing paths
- Delivery workers
- External notification providers
- Retry and Dead Letter Queue mechanisms

---

## 2. Technology Responsibilities

Each infrastructure component has a clearly defined responsibility.

| Technology | Responsibility |
|---|---|
| Kafka | Event ingestion and event streaming |
| RabbitMQ | Delivery routing, queues, priority and DLQ |
| Redis | Cache, rate limiting, frequency caps and idempotency |
| PostgreSQL | Persistent application data and audit records |
| Node.js | Backend runtime |
| TypeScript | Application language |
| Handlebars | Notification template rendering |
| Docker Compose | Local infrastructure |

---

## 3. Event Processing Flow

The agreed event-processing pipeline is:

```text
Financial Event
      |
      v
Kafka
      |
      v
Kafka Consumer
      |
      v
Validation
      |
      v
Enrichment
      |
      v
Preference Resolution
      |
      v
Qualification
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
Compliance
      |
      v
Channel Routing
      |
      v
Provider Selection
      |
      v
Idempotency / Deduplication
      |
      v
RabbitMQ
      |
      v
Delivery Workers
      |
      v
Notification Provider
      |
      v
User
```

## 4. Critical Event Isolation
Critical financial events are isolated from normal high-volume events.
Critical Examples
- Margin calls
- Regulatory notices
- Critical account events
- Risk threshold breaches

Normal Examples
- Price alerts
- Market updates
- Engagement notifications

The architecture uses dedicated Kafka topics and consumer resources for
critical traffic.

```text
                    Kafka
                      |
             +--------+--------+
             |                 |
             v                 v
       Critical Topic     Normal Topic
             |                 |
             v                 v
      Critical Group     Normal Group
             |                 |
             v                 v
      Critical Workers   Normal Workers
```
This prevents high-volume normal traffic from starving critical events.

## 5. Reliability Mechanisms
The architecture includes the following reliability mechanisms:

### Idempotency
Redis-based TTL keys prevent duplicate processing and notification delivery.

### Retry
Failed operations use controlled retries with exponential backoff and jitter.

### Dead Letter Queue
Messages that cannot be processed after the configured retry limit are moved
to the DLQ.

### Circuit Breakers
Repeated provider failures trigger circuit breakers to prevent cascading
failures.

### Provider Failover
If a primary provider becomes unavailable, an alternative provider may be
selected.

### Backpressure
Lower-priority traffic may be delayed or shed during overload while critical
traffic remains protected.

## 6. Compliance
Compliance is considered part of the notification processing pipeline.

For SMS notifications:

- DND status must be checked as close as possible to dispatch.
- Transactional/promotional classification must be maintained.
- Consent information must be available.
- Compliance decisions must be auditable.

## 7. Notification Channels
The engine supports:
- SMS
- Email
- Push notifications
- WhatsApp
- In-app notifications

Channel selection is based on:
- User preferences
- Event priority
- Channel availability
- Compliance
- Provider health
- Channel scoring

## 8. Event Taxonomy
The event taxonomy currently contains 32 defined event types across:
- Transaction
- Investment
- Market
- Risk
- Regulatory
- Account

Each event contains:
- Event type
- Description
- Category
- Priority

The taxonomy is maintained separately in:
docs/event-taxonomy.yaml

## 9. API Contract
Internal API contracts are defined using OpenAPI 3.0.
The API contract is maintained in:
docs/openapi.yaml
The initial API contract covers:
- Financial event ingestion
- Notification status
- User notification preferences
- Health checks
API implementation will be completed during later implementation phases.

## 10. Architecture Documentation
The following documents were created during Day 1:
```text
docs/
├── architecture.md
├── technology-choices.md
├── event-processing-pipeline.md
├── openapi.yaml
├── event-taxonomy.yaml
└── day1-architecture-review.md
```

### Architecture
Contains the C4:
- System Context Diagram
- Container Diagram
- Component Diagram

### Technology Choices
Documents the reasoning behind the selected technologies.

### Event Processing Pipeline
Documents the complete flow from financial event ingestion to notification
delivery.

### OpenAPI Contract
Defines the initial internal API contracts.

### Event Taxonomy
Defines the supported financial event types.

## 11. Day 1 Completion Checklist
### Architecture

- System Context defined
- Container architecture defined
- Component architecture defined
- Event processing pipeline documented
- Critical vs normal processing defined
- Delivery failover documented

### Technology

- Kafka decision documented
- RabbitMQ decision documented
- Redis decision documented
- PostgreSQL decision documented
- Node.js and TypeScript documented
- Supporting tools documented

### API

- OpenAPI 3.0 contract created
- Event ingestion contract defined
- Notification status contract defined
- Preference APIs defined
- Health check defined

### Events

- Event taxonomy created
- 25+ event types defined
- Event categories defined
- Event priorities defined

### Reliability

- Idempotency strategy defined
- Retry strategy defined
- DLQ strategy defined
- Circuit breaker strategy defined
- Provider failover defined
- Critical traffic isolation defined