# ZeTheta API documentation

Start the HTTP API and open `http://localhost:3000/api-docs` for the interactive Swagger UI. The raw, versioned OpenAPI 3.0 document is served at `/openapi.json`.

Kafka is the event-ingestion boundary, so it is deliberately not represented as an HTTP endpoint. The event schema is defined in `src/events/schemas.ts`; operational REST endpoints are documented in OpenAPI.

Import `docs/api/zetheta.postman_collection.json` into Postman, set `baseUrl` if your server uses another port, and run the **Preferences**, **Delivery callbacks**, **DLQ**, **Analytics**, and **Health** requests.
