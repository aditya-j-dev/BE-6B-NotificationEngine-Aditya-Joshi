import { describe, expect, it } from "vitest";

import { createTestEvent } from "../../events/factory";
import { deserializeEvent, serializeEvent } from "../avro";

describe("Avro event serialization", () => {
    it("preserves the idempotency key through a round trip", () => {
        const event = createTestEvent("TXNX-001");

        const decoded = deserializeEvent(serializeEvent(event));

        expect(decoded.idempotencyKey).toBe(event.idempotencyKey);
        expect(decoded.eventId).toBe(event.eventId);
    });
});
