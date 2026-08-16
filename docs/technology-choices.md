# Technology Choices & Justification

## 1. Node.js

### Decision

Use Node.js as the backend runtime.

### Justification

- Well suited for I/O-intensive applications
- Efficient handling of asynchronous operations
- Strong ecosystem for Kafka, RabbitMQ, Redis, PostgreSQL and HTTP APIs
- Suitable for building event-driven services
- Supports high concurrency without requiring a thread per request

Node.js is therefore suitable for the notification engine, which performs a
large number of asynchronous operations involving message brokers, databases,
caches and external notification providers.

---

## 2. TypeScript

### Decision

Use TypeScript as the primary programming language.

### Justification

- Static type checking
- Better maintainability for a large backend codebase
- Strong typing for the 25+ financial event types
- Better IDE support and developer experience
- Helps detect errors during development rather than at runtime
- Supports strict typing for event payloads and service interfaces

The project uses strict TypeScript configuration with:

```text
strict: true
noImplicitAny: true
```

## 3. PostgreSQL

### Decision

Use PostgreSQL as the primary persistent database.

### Justification

- Strong consistency guarantees
- ACID transactions
- Relational data modelling
- Suitable for users, notifications, preferences and audit records
- Supports JSONB for flexible event-related data
- Supports indexing and partitioning for large notification datasets
- Mature and reliable open-source database
- PostgreSQL acts as the persistent source of truth for the application.

## 4. Redis

### Decision

Use Redis for caching and rapidly changing state.

### Justification

Redis is suitable for operations requiring very low latency, including:

- User preference caching
- Frequency-cap counters
- Provider rate limiting
- DND caching
- Idempotency keys
- Deduplication
- Real-time counters
- User feature data

Redis is not used as the primary persistent source of truth. Persistent data
remains in PostgreSQL.

## 5. Apache Kafka

### Decision

Use Apache Kafka as the primary event bus.

### Justification

- High-throughput event streaming
- Durable event retention
- Consumer groups for parallel processing
- Horizontal scalability
- Event replay capability
- Suitable for large bursts of financial events
- Supports separation of critical and normal event streams

Kafka is responsible primarily for event ingestion and event streaming.

Example:

```text
Financial Event
      |
      v
    Kafka
      |
      +---- Critical Events
      |
      +---- Normal Events       
```
## 6. RabbitMQ

### Decision

Use RabbitMQ for delivery-oriented messaging.

### Justification

- Flexible routing
- Message acknowledgements
- Priority queues
- Retry support
- Dead Letter Queue support
- Suitable for communication between notification processing and delivery workers

RabbitMQ is responsible primarily for notification delivery routing and queue management.

Kafka and RabbitMQ therefore have different responsibilities:

```text
Kafka
 |
 +-- Event ingestion
 +-- Event streaming
 +-- Consumer groups
 +-- Event replay


RabbitMQ
 |
 +-- Delivery routing
 +-- Priority queues
 +-- Acknowledgements
 +-- Retry handling
 +-- Dead Letter Queue
```
## 7. Handlebars

### Decision

Use Handlebars as the notification template engine.

### Justification

- Simple template syntax
- Supports variable interpolation
- Separates notification content from application logic
- Suitable for channel-specific templates
- Supports reusable helpers
- Can support localisation and personalisation

Templates can contain dynamic fields such as:

```text
Hello {{userName}},

Your order {{orderId}} has been executed at {{executionPrice}}.
```

This prevents notification content from being hardcoded into business logic.

## 8. Docker & Docker Compose

### Decision

Use Docker Compose for local infrastructure.

### Justification

The project depends on multiple infrastructure components:

- PostgreSQL
- Redis
- Kafka
- RabbitMQ

Running these services through Docker Compose provides:

- Reproducible development environments
- Consistent service versions
- Simple local setup
- Isolated infrastructure
- Easy service startup and shutdown
- Reduced dependency on locally installed infrastructure

The development environment uses Docker Compose to start the required
infrastructure services together.

## 9. ESLint

### Decision

Use ESLint with TypeScript support.

### Justification

- Detects common programming errors
- Enforces consistent coding practices
- Provides static analysis
- Helps maintain code quality across the project
- Works with TypeScript

The project uses the recommended TypeScript ESLint configuration.

## 10. Prettier

### Decision

Use Prettier for code formatting.

### Justification

- Consistent code formatting
- Reduces formatting-related differences between developers
- Easy integration with editors and CI
- Reduces time spent on manual formatting decisions

ESLint and Prettier have separate responsibilities:

```text
ESLint
  |
  +-- Code quality
  +-- Potential errors
  +-- Coding rules


Prettier
  |
  +-- Code formatting
  +-- Consistent style
```

## 11. Jest

### Decision

Use Jest for automated testing.

### Justification

Jest is suitable for:

- Unit testing
- Service testing
- Mocking dependencies
- Testing event-processing logic
- Testing retry and failure scenarios
- Measuring code coverage

The notification engine requires extensive testing because incorrect
notification behaviour can result in missed financial alerts or duplicate
notifications.

## 12. Supertest

### Decision

Use Supertest for HTTP API testing.

### Justification

Supertest allows the project to test Express API endpoints without requiring
an external HTTP client.    

It will be used for testing APIs such as:

```text
GET /users/:id/preferences
PUT /users/:id/preferences
```

and other internal service APIs defined later in the project.

## Technology Selection Summary

| Technology | Primary Responsibility | Main Reason |
|---|---|---|
| Node.js | Backend runtime | Asynchronous I/O and high concurrency |
| TypeScript | Application language | Type safety and maintainability |
| PostgreSQL | Persistent storage | Consistency and relational modelling |
| Redis | Fast state and caching | Low-latency operations |
| Kafka | Event streaming | High throughput and replay |
| RabbitMQ | Delivery messaging | Routing, priority and DLQ |
| Handlebars | Templates | Personalisation and localisation |
| Docker Compose | Infrastructure | Reproducible local environment |
| ESLint | Code quality | Static analysis |
| Prettier | Formatting | Consistent code style |
| Jest | Testing | Unit and integration testing |
| Supertest | API testing | HTTP endpoint testing |

## Overall Architecture Rationale

The technologies are selected based on the different responsibilities within
the notification pipeline rather than using a single tool for every problem.


```text
                 Financial Events
                       |
                       v
                    Kafka
               Event Streaming
                       |
                       v
               Event Processing
                       |
             +---------+---------+
             |                   |
             v                   v
           Redis             PostgreSQL
        Fast State          Persistent Data
             |                   |
             +---------+---------+
                       |
                       v
                 Routing Engine
                       |
                       v
                   RabbitMQ
               Delivery Queues
                       |
                       v
                Delivery Workers
                       |
                       v
             External Providers
This separation allows each technology to perform the role it is best suited
for while keeping the overall system scalable, fault tolerant and maintainable.