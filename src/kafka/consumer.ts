import { Kafka, Consumer, EachMessagePayload } from "kafkajs";
import { FinancialEventSchema } from "../events/schemas";
import { deserializeEvent } from "./avro";
import {
    PrismaClient,
} from "../generated/prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";

import {
    EventDeduplicationService,
} from "../deduplication/service";

import {
    EventEnrichmentService,
} from "../enrichment/service";

import {
    EventRoutingService,
} from "../routing/service";

import {
    NotificationPipeline,
} from "./pipeline";

const adapter = new PrismaPg({
    connectionString:
        process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
    adapter,
});

const deduplication =
    new EventDeduplicationService();

const enrichment =
    new EventEnrichmentService(prisma);

const routing =
    new EventRoutingService();

const pipeline =
    new NotificationPipeline(
        deduplication,
        enrichment,
        routing,
    );

const kafka = new Kafka({
    clientId: "notification-engine-worker",
    brokers: [process.env.KAFKA_BROKERS ?? "localhost:9092"],
});

const consumer: Consumer = kafka.consumer({
    groupId: "notification-worker",
});

async function processMessage({
    topic,
    partition,
    message,
}: EachMessagePayload) {
    if (!message.value) {
        throw new Error("Kafka message has no value");
    }

    console.log("\nReceived Kafka message:");
    console.log({
        topic,
        partition,
        offset: message.offset,
        key: message.key?.toString(),
    });

    const event = deserializeEvent(message.value);

    const validation = FinancialEventSchema.safeParse(event);

    if (!validation.success) {
        console.error("Invalid event payload:");
        console.error(validation.error.format());

        throw new Error("Event validation failed");
    }

    const validatedEvent = validation.data;

    console.log("Decoded and validated event:");
    console.log({
        eventId: validatedEvent.eventId,
        eventType: validatedEvent.eventType,
        userId: validatedEvent.userId,
    });

    // Simulate notification-engine processing.
    const result =
        await pipeline.process(
            validatedEvent,
        );

    if (result.duplicate) {
        console.log(
            `Duplicate event ${validatedEvent.eventId} skipped`,
        );

        return;
    }

    console.log("Routing decision:");

    console.dir(
        result.routingDecision,
        { depth: null },
    );

    console.log(
        `Successfully processed offset ${message.offset}`,
    );
}



export async function startConsumer() {
    await consumer.connect();

    await consumer.subscribe({
        topic: "notification-events",
        fromBeginning: true,
    });

    await consumer.run({
        autoCommit: false,

        eachMessage: async (payload) => {
            try {
                await processMessage(payload);

                /*
                 * Commit ONLY after successful processing.
                 *
                 * KafkaJS expects the next offset to be committed,
                 * therefore current offset + 1.
                 */
                await consumer.commitOffsets([
                    {
                        topic: payload.topic,
                        partition: payload.partition,
                        offset: (
                            BigInt(payload.message.offset) + 1n
                        ).toString(),
                    },
                ]);

                console.log(
                    `Committed offset ${payload.message.offset}`,
                );
            } catch (error) {
                console.error(
                    `Failed to process offset ${payload.message.offset}`,
                );

                console.error(error);

                /*
                 * IMPORTANT:
                 * No offset commit occurs here.
                 *
                 * The message therefore remains uncommitted and
                 * can be processed again.
                 */
            }
        },
    });
}

export async function stopConsumer() {
    await consumer.disconnect();

    await deduplication.close();

    await prisma.$disconnect();
}