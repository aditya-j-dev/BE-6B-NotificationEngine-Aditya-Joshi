# ZeTheta architecture

## C4 system context

```mermaid
flowchart TB
    Trading[Trading and core banking systems] --> ZeTheta[ZeTheta notification engine]
    Market[Market-data systems] --> ZeTheta
    Compliance[Regulatory systems] --> ZeTheta
    ZeTheta --> User[Financial customer]
    ZeTheta --> Providers[Messaging providers]
    Operations[Operations and compliance team] --> ZeTheta
```

## C4 containers

```mermaid
flowchart LR
    Producers --> Kafka[(Kafka topics)]
    Kafka --> Worker[ZeTheta consumer and pipeline]
    Worker --> Postgres[(PostgreSQL)]
    Worker --> Redis[(Redis)]
    Worker --> RabbitMQ[(RabbitMQ)]
    RabbitMQ --> Delivery[Delivery providers]
    API[HTTP API and OpenAPI] --> Postgres
    API --> Redis
```

## C4 components

```mermaid
flowchart LR
    Consumer[Kafka consumer] --> Avro[Avro deserialiser]
    Avro --> Validate[Zod validation]
    Validate --> Deduplicate[Redis deduplication]
    Deduplicate --> Enrich[User and preference enrichment]
    Enrich --> Comply[DND, consent, caps and quiet hours]
    Comply --> Route[Channel and provider routing]
    Route --> Retry[Retry, acknowledgements and DLQ]
```

## Event-processing sequence

```mermaid
sequenceDiagram
    participant P as Producer
    participant K as Kafka
    participant W as ZeTheta worker
    participant R as Redis
    participant DB as PostgreSQL
    participant Q as RabbitMQ
    participant D as Delivery provider

    P->>K: Publish Avro financial event
    K->>W: Consume event
    W->>R: Check idempotency and caps
    W->>DB: Read user, preferences and audit data
    W->>W: Validate, enrich, comply and route
    W->>Q: Queue notification
    Q->>D: Deliver through selected provider
    D-->>W: Delivery acknowledgement
    W->>DB: Persist status and audit trail
```

## Failure and retry sequence

```mermaid
sequenceDiagram
    participant W as Delivery worker
    participant P as Provider
    participant R as Retry scheduler
    participant DLQ as Dead-letter queue

    W->>P: Send notification
    alt delivered
        P-->>W: Success acknowledgement
        W->>W: Mark delivered
    else transient failure
        P-->>W: Retryable error
        W->>R: Schedule exponential-backoff retry
    else retry budget exhausted
        W->>DLQ: Store classified failure
    end
```

## Database ER diagram

```mermaid
erDiagram
    USER ||--o{ USER_PREFERENCE : configures
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ CONSENT_RECORD : grants
    USER ||--o{ USER_CHANNEL_PERFORMANCE : measures
    NOTIFICATION ||--o{ DELIVERY_ACKNOWLEDGEMENT : records
    NOTIFICATION ||--o{ NOTIFICATION_STATE_LOG : transitions
    NOTIFICATION ||--o{ DEAD_LETTER_QUEUE : may_enter
    DELIVERY_PROVIDER ||--o{ NOTIFICATION : delivers

    USER {
      uuid id PK
      string email UK
      string phone UK
      string timezone
      string segment
    }
    USER_PREFERENCE {
      uuid user_id FK
      string event_category
      string event_type
      string channel
      boolean enabled
    }
    NOTIFICATION {
      uuid id
      string event_id
      string event_type
      string status
      string channel
    }
    DELIVERY_ACKNOWLEDGEMENT {
      uuid id PK
      string provider
      string callback_id UK
      string provider_status
    }
```

Detailed design decisions remain in [docs/architecture.md](docs/architecture.md).
