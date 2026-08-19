import { createTestEvent } from "../events/factory";
import {
    serializeEvent,
    deserializeEvent,
} from "./avro";

import { FinancialEventSchema } from "../events/schemas";

const event = createTestEvent("TXNX-001");

console.log("Original event:");
console.dir(event, { depth: null });

const encoded = serializeEvent(event);

console.log("\nAvro encoded size:");
console.log(`${encoded.length} bytes`);

const decoded = deserializeEvent(encoded);

console.log("\nDecoded event:");
console.dir(decoded, { depth: null });

const validation =
    FinancialEventSchema.safeParse(decoded);

if (!validation.success) {
    console.error(
        "Decoded event failed Zod validation:",
        validation.error,
    );

    process.exit(1);
}

console.log("\n✓ Avro round-trip successful");
console.log("✓ Zod validation successful");
console.log("✓ Event type:", decoded.eventType);