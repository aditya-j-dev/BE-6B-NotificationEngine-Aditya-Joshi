/** The versioned contract for every HTTP endpoint exposed by the API factory. */
export const openApiDocument = {
    openapi: "3.0.3",
    info: {
        title: "ZeTheta Notification Engine API",
        version: "1.0.0",
        description: "Operational APIs for notification preferences, delivery callbacks, DLQ management, analytics, metrics, and health checks. Event ingestion is Kafka-based and is intentionally not an HTTP endpoint.",
    },
    servers: [{ url: "http://localhost:3000", description: "Local development" }],
    tags: [
        { name: "Preferences" }, { name: "Delivery" }, { name: "Operations" },
        { name: "Analytics" }, { name: "Observability" },
    ],
    paths: {
        "/users/{userId}/preferences": {
            get: {
                tags: ["Preferences"], summary: "Get effective notification preferences",
                parameters: [{ $ref: "#/components/parameters/UserId" }],
                responses: {
                    "200": {
                        description: "Effective preferences",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/PreferenceResponse" } } },
                    },
                    "404": { $ref: "#/components/responses/UserNotFound" },
                },
            },
            put: {
                tags: ["Preferences"], summary: "Create or update preferences",
                parameters: [{ $ref: "#/components/parameters/UserId" }],
                requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdatePreferencesRequest" }, examples: { disableEmail: { value: { preferences: [{ eventCategory: "transaction", eventType: "TXNX-001", channel: "EMAIL", enabled: false }] } } } } } },
                responses: { "200": { description: "Updated preferences", content: { "application/json": { schema: { $ref: "#/components/schemas/PreferenceResponse" } } } }, "400": { $ref: "#/components/responses/InvalidPayload" }, "404": { $ref: "#/components/responses/UserNotFound" } },
            },
        },
        "/provider-callbacks": {
            post: { tags: ["Delivery"], summary: "Record a delivery provider callback", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProviderCallback" }, example: { callbackId: "EV123", provider: "twilio", externalId: "SM123", status: "DELIVERED", occurredAt: "2026-09-15T10:01:00.000Z", providerStatus: "delivered" } } } }, responses: { "200": { description: "Callback applied or ignored" }, "202": { description: "Callback stored but no notification matched" }, "400": { $ref: "#/components/responses/InvalidPayload" } } },
        },
        "/dlq": { get: { tags: ["Operations"], summary: "List dead-letter queue entries", parameters: [{ name: "reason", in: "query", schema: { type: "string" } }, { name: "includeResolved", in: "query", schema: { type: "boolean" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1 } }, { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } }], responses: { "200": { description: "DLQ page" } } } },
        "/dlq/{entryId}/retry": { post: { tags: ["Operations"], summary: "Retry a DLQ entry", parameters: [{ $ref: "#/components/parameters/EntryId" }], requestBody: { $ref: "#/components/requestBodies/DlqAction" }, responses: { "200": { description: "Entry scheduled for retry" }, "404": { description: "Entry not found" }, "409": { description: "Entry already resolved" } } } },
        "/dlq/{entryId}/discard": { post: { tags: ["Operations"], summary: "Discard a DLQ entry", parameters: [{ $ref: "#/components/parameters/EntryId" }], requestBody: { $ref: "#/components/requestBodies/DlqAction" }, responses: { "200": { description: "Entry discarded" }, "404": { description: "Entry not found" }, "409": { description: "Entry already resolved" } } } },
        "/metrics": { get: { tags: ["Observability"], summary: "Prometheus metrics", responses: { "200": { description: "Prometheus text exposition", content: { "text/plain": { schema: { type: "string" } } } } } } },
        "/analytics/delivery-rates": { get: { tags: ["Analytics"], summary: "Delivery rates", parameters: [{ $ref: "#/components/parameters/AnalyticsFilters" }], responses: { "200": { description: "Delivery-rate metrics" } } } },
        "/analytics/channel-performance": { get: { tags: ["Analytics"], summary: "Per-channel delivery performance", parameters: [{ $ref: "#/components/parameters/Channel" }], responses: { "200": { description: "Channel performance metrics" } } } },
        "/analytics/opt-out-trends": { get: { tags: ["Analytics"], summary: "Opt-out trends", parameters: [{ $ref: "#/components/parameters/From" }, { $ref: "#/components/parameters/To" }], responses: { "200": { description: "Opt-out trend metrics" } } } },
        "/analytics/costs": { get: { tags: ["Analytics"], summary: "Notification costs", parameters: [{ $ref: "#/components/parameters/AnalyticsFilters" }, { name: "provider", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Cost metrics" } } } },
        "/analytics/mock-dashboard": { get: { tags: ["Analytics"], summary: "Demo dashboard dataset", responses: { "200": { description: "Dashboard-ready demo data" } } } },
        "/health": { get: { tags: ["Observability"], summary: "Readiness check", responses: { "200": { $ref: "#/components/responses/Healthy" }, "503": { $ref: "#/components/responses/Unhealthy" } } } },
        "/health/ready": { get: { tags: ["Observability"], summary: "Readiness check alias", responses: { "200": { $ref: "#/components/responses/Healthy" }, "503": { $ref: "#/components/responses/Unhealthy" } } } },
        "/health/live": { get: { tags: ["Observability"], summary: "Process liveness check", responses: { "200": { $ref: "#/components/responses/Healthy" } } } },
    },
    components: {
        parameters: {
            UserId: { name: "userId", in: "path", required: true, schema: { type: "string" }, example: "user-1" },
            EntryId: { name: "entryId", in: "path", required: true, schema: { type: "string" }, example: "dlq-entry-1" },
            Channel: { name: "channel", in: "query", schema: { type: "string", enum: ["SMS", "EMAIL", "PUSH", "WHATSAPP", "IN_APP"] } },
            From: { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            To: { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
            AnalyticsFilters: { name: "channel", in: "query", schema: { type: "string", enum: ["SMS", "EMAIL", "PUSH", "WHATSAPP", "IN_APP"] }, description: "Optional; from and to also accepted as ISO-8601 query parameters." },
        },
        requestBodies: {
            DlqAction: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            required: ["actor"],
                            properties: { actor: { type: "string", example: "ops@example.com" } },
                        },
                    },
                },
            },
        },
        schemas: {
            Preference: { type: "object", required: ["eventCategory", "channel"], properties: { eventCategory: { type: "string", enum: ["transaction", "risk_margin", "sip_investment", "market_price", "regulatory_compliance"] }, eventType: { type: "string", default: "*" }, channel: { type: "string", enum: ["SMS", "EMAIL", "PUSH", "WHATSAPP", "IN_APP"] }, enabled: { type: "boolean", default: true }, quietHoursOverride: { type: "boolean", default: false }, digestMode: { type: "string", enum: ["immediate", "hourly", "daily"], default: "immediate" }, priorityOverride: { type: ["integer", "null"], minimum: 1, maximum: 5 } } },
            UpdatePreferencesRequest: { type: "object", required: ["preferences"], properties: { preferences: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/Preference" } } } },
            PreferenceResponse: { type: "object", required: ["userId", "preferences"], properties: { userId: { type: "string" }, preferences: { type: "array", items: { $ref: "#/components/schemas/Preference" } } } },
            ProviderCallback: { type: "object", required: ["callbackId", "provider", "externalId", "status", "occurredAt", "providerStatus"], properties: { callbackId: { type: "string" }, provider: { type: "string" }, externalId: { type: "string" }, status: { type: "string", enum: ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "BOUNCED"] }, occurredAt: { type: "string", format: "date-time" }, providerStatus: { type: "string" }, payload: { type: "object", additionalProperties: true } } },
            Error: { type: "object", properties: { error: { type: "string" } } },
            HealthReport: { type: "object", properties: { status: { type: "string", enum: ["HEALTHY", "UNHEALTHY"] }, checkedAt: { type: "string", format: "date-time" }, components: { type: "array", items: { type: "object" } } } },
        },
        responses: {
            UserNotFound: { description: "User not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            InvalidPayload: { description: "Validation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            Healthy: { description: "Healthy", content: { "application/json": { schema: { $ref: "#/components/schemas/HealthReport" } } } },
            Unhealthy: { description: "One or more dependencies are unavailable", content: { "application/json": { schema: { $ref: "#/components/schemas/HealthReport" } } } },
        },
    },
} as const;
