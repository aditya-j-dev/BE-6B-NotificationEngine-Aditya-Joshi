import { Kafka, Producer } from "kafkajs";
import type { FinancialEvent } from "../events/types";
import { serializeEvent } from "./avro";

const kafka = new Kafka({
    clientId: "notification-engine",
    brokers: [
        process.env.KAFKA_BROKERS ?? "localhost:9092",
    ],
});

let producer: Producer | null = null;

export async function getKafkaProducer(): Promise<Producer> {
    if (producer) {
        return producer;
    }

    producer = kafka.producer({
        idempotent: true,
        maxInFlightRequests: 5,
        allowAutoTopicCreation: false,
    });

    await producer.connect();

    return producer;
}

export async function publishEvent(
    event: FinancialEvent,
): Promise<void> {
    const kafkaProducer = await getKafkaProducer();

    const topic =
        event.priority === "CRITICAL"
            ? "notification-critical"
            : "notification-events";

    const serializedEvent = serializeEvent(event);

    await kafkaProducer.send({
        topic,
        messages: [
            {
                key: event.userId,
                value: serializedEvent,
                headers: {
                    "schema-version": "1",
                    "serialization": "avro",
                    "content-type":
                        "application/avro",
                },
            },
        ],
    });
}

export async function disconnectKafkaProducer(): Promise<void> {
    if (!producer) {
        return;
    }

    await producer.disconnect();
    producer = null;
}