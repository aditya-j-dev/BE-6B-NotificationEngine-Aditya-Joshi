# Event-Driven Notification Engine

A scalable, event-driven notification backend for financial applications.

The system processes 25+ financial event types such as transaction alerts,
margin calls, SIP reminders, price alerts, and regulatory notices, and delivers
notifications through SMS, email, push notifications, WhatsApp, and in-app channels.

## Project Overview

This project implements a resilient multi-channel notification platform with:

- Event-driven architecture
- Kafka-based event ingestion and streaming
- RabbitMQ-based delivery routing and priority queues
- Redis-based caching, rate limiting, frequency capping, and real-time state
- PostgreSQL as the primary persistent data store
- Multi-channel notification delivery
- User preference management
- TRAI DND compliance
- Frequency capping and quiet hours
- Template personalisation and localisation
- Retry strategy and Dead Letter Queue (DLQ)
- Delivery tracking
- Real-time analytics and observability

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Runtime | Node.js + TypeScript | Backend runtime |
| API | Express.js | HTTP API |
| Database | PostgreSQL 15 | Primary persistent storage |
| Cache / State | Redis 7 | Caching, rate limiting, counters |
| Event Streaming | Apache Kafka | Event ingestion and processing |
| Message Queue | RabbitMQ 3.12 | Delivery routing, priorities, DLQ |
| Template Engine | Handlebars.js | Notification templates |
| Containerisation | Docker Compose | Local infrastructure |
| Testing | Jest + Supertest | Unit and API testing |

## High-Level Architecture

```text
Financial Event Producers
          |
          v
        Kafka
          |
          v
   Event Processing
          |
          v
   Policy / Qualification
          |
     +----+----+
     |         |
 Critical    Normal
     |         |
     +----+----+
          |
          v
    Routing Engine
          |
          v
      RabbitMQ
          |
          v
   Delivery Workers
     /    |    \
    /     |     \
  SMS   Email   Push
              WhatsApp
              In-App
```              

Redis  ---> Cache / Rate Limiting / Frequency Caps
PostgreSQL -> Persistent Data / Audit / Notification History

## Architecture Decisions

### ADR-001: Kafka as the Primary Event Bus

**Decision:** Use Apache Kafka for financial event ingestion and event streaming.

**Reason:**

- High-throughput event processing
- Consumer groups for horizontal scaling
- Durable event retention
- Event replay capability
- Suitable for large notification bursts

---

### ADR-002: RabbitMQ for Delivery Routing

**Decision:** Use RabbitMQ for notification delivery routing.

**Reason:**

- Flexible routing
- Message acknowledgements
- Priority queues
- Retry handling
- Dead Letter Queue support

Kafka handles event streaming, while RabbitMQ handles delivery-oriented processing.

---

### ADR-003: Redis for Fast State

**Decision:** Use Redis for frequently accessed and rapidly changing state.

**Uses:**

- User preference caching
- Frequency-cap counters
- Rate limiting
- Deduplication
- DND cache
- Real-time counters

PostgreSQL remains the persistent source of truth.

---

### ADR-004: PostgreSQL for Persistent Storage

**Decision:** Use PostgreSQL as the primary database.

**Reason:**

- Strong consistency
- Relational data modelling
- Transaction support
- JSONB support
- Suitable for notification history and audit records

---

### ADR-005: Separate Critical and Normal Notification Processing

Critical financial notifications such as margin calls must not compete with high-volume, lower-priority notifications such as price alerts.

Critical events therefore use dedicated Kafka topics and consumer resources.

---

### ADR-006: Final DND Check Before SMS Dispatch

TRAI DND status must be checked as close as possible to actual SMS dispatch.

This prevents a user's DND status from becoming stale while a notification is waiting in a delivery queue.

---

### ADR-007: Asynchronous Delivery

Provider calls are handled asynchronously through delivery workers rather than blocking the main event-processing pipeline.

This improves scalability, fault isolation, and resilience.

---

### ADR-008: Retry and Dead Letter Queue

Failed deliveries use controlled retries with exponential backoff and jitter.

Messages that cannot be processed after the configured retry limit are moved to a Dead Letter Queue for monitoring and remediation.

---

## Project Structure

```text
src/          Application source code
tests/        Unit and integration tests
docs/         Architecture and project documentation
config/       Application configuration
scripts/      Utility and development scripts
migrations/   Database migrations
```

## Local Development

### Prerequisites

- Node.js
- npm
- Docker Desktop
- Docker Compose

### Install Dependencies

```bash
npm install
```

## Build TypeScript

```bash
npm run build
```

## Run Lint

```bash
npm run lint
```

## Format Code

```bash
npm run format
```

### Start Infrastructure

```bash
docker compose up -d
```

### Stop Infrastructure

```bash
docker compose down
```

## Running Tests

```bash
npm test
```
