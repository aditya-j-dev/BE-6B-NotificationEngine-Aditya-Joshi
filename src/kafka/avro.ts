import avro from "avsc";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FinancialEvent } from "../events/types";

const schemaPath = resolve(
    process.cwd(),
    "schemas",
    "financial-event-v1.avsc",
);

const schema = JSON.parse(
    readFileSync(schemaPath, "utf-8"),
);

const FinancialEventAvroSchema =
    avro.Type.forSchema(schema);

function toAvroEventType(eventType: string): string {
    return eventType.replaceAll("-", "_");
}

function fromAvroEventType(eventType: string): string {
    const [prefix, number] = eventType.split("_");

    return `${prefix}-${number}`;
}

export function serializeEvent(event: FinancialEvent): Buffer {
    const {
        metadata,
        eventId,
        eventType,
        eventCategory,
        userId,
        occurredAt,
        correlationId,
        source,
        priority,
        ...payload
    } = event;

    const avroEvent = {
        eventId,
        eventType: toAvroEventType(eventType),
        eventCategory,
        userId,
        occurredAt,
        correlationId,
        source,
        priority,
        payload: JSON.stringify(payload),
        metadata: metadata
            ? Object.fromEntries(
                Object.entries(metadata).map(([key, value]) => [
                    key,
                    String(value),
                ]),
            )
            : null,
    };

    return FinancialEventAvroSchema.toBuffer(avroEvent);
}

export function deserializeEvent(
    buffer: Buffer,
): FinancialEvent {
    const decoded = FinancialEventAvroSchema.fromBuffer(buffer) as {
        eventId: string;
        eventType: string;
        eventCategory: string;
        userId: string;
        occurredAt: string;
        correlationId: string;
        source: string;
        priority: string;
        payload: string;
        metadata: Record<string, string> | null;
    };

    const payload = JSON.parse(decoded.payload);

    return {
        eventId: decoded.eventId,
        eventType: fromAvroEventType(decoded.eventType),
        eventCategory: decoded.eventCategory as FinancialEvent["eventCategory"],
        userId: decoded.userId,
        occurredAt: decoded.occurredAt,
        correlationId: decoded.correlationId,
        source: decoded.source,
        priority: decoded.priority as FinancialEvent["priority"],
        ...payload,
        ...(decoded.metadata
            ? { metadata: decoded.metadata }
            : {}),
    } as FinancialEvent;
}