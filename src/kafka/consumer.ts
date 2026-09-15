import { Kafka, Consumer, EachMessagePayload } from "kafkajs";
import { Pool } from "pg";
import { FinancialEventSchema } from "../events/schemas";
import { deserializeEvent } from "./avro";
import {
    PrismaClient,
} from "../generated/prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";

import {
    EventDeduplicationService,
} from "../deduplication/service";
import { RedisConnectionPool } from "../deduplication/redis-pool";

import {
    EventEnrichmentService,
} from "../enrichment/service";

import {
    EventRoutingService,
} from "../routing/service";

import {
    NotificationPipeline,
} from "./pipeline";

function boundedPositiveInteger(value: string | undefined, fallback: number, name: string): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
    return parsed;
}

const postgresPool = new Pool({
    connectionString:
        process.env.DATABASE_URL,
    max: boundedPositiveInteger(process.env.POSTGRES_POOL_MAX, 20, "POSTGRES_POOL_MAX"),
    min: boundedPositiveInteger(process.env.POSTGRES_POOL_MIN, 2, "POSTGRES_POOL_MIN"),
    idleTimeoutMillis: boundedPositiveInteger(process.env.POSTGRES_POOL_IDLE_TIMEOUT_MS, 30_000, "POSTGRES_POOL_IDLE_TIMEOUT_MS"),
    connectionTimeoutMillis: boundedPositiveInteger(process.env.POSTGRES_POOL_CONNECTION_TIMEOUT_MS, 5_000, "POSTGRES_POOL_CONNECTION_TIMEOUT_MS"),
});

const adapter = new PrismaPg(postgresPool, {
    disposeExternalPool: false,
});

const prisma = new PrismaClient({
    adapter,
});

const redisPool = new RedisConnectionPool(
    process.env.REDIS_URL ?? "redis://localhost:6380",
    {
        size: boundedPositiveInteger(process.env.REDIS_POOL_SIZE, 8, "REDIS_POOL_SIZE"),
        maxRetriesPerRequest: boundedPositiveInteger(process.env.REDIS_MAX_RETRIES_PER_REQUEST, 3, "REDIS_MAX_RETRIES_PER_REQUEST"),
        connectTimeoutMs: boundedPositiveInteger(process.env.REDIS_CONNECT_TIMEOUT_MS, 5_000, "REDIS_CONNECT_TIMEOUT_MS"),
    },
);

const deduplication = new EventDeduplicationService(redisPool);

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
    groupId: process.env.KAFKA_GROUP_ID ?? "notification-worker",
});

const verbosePipelineLogging = process.env.DEBUG_PIPELINE_LOGS === "true";

function debugPipelineLog(message: string, details?: unknown): void {
    if (verbosePipelineLogging) console.log(message, details ?? "");
}

async function processMessage({
    topic,
    partition,
    message,
}: EachMessagePayload) {
    if (!message.value) {
        throw new Error("Kafka message has no value");
    }

    debugPipelineLog("Received Kafka message", {
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

    debugPipelineLog("Decoded and validated event", {
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
        debugPipelineLog(`Duplicate event ${validatedEvent.eventId} skipped`);

        return;
    }

    debugPipelineLog("Routing decision", result.routingDecision);
    debugPipelineLog(`Successfully processed offset ${message.offset}`);
}



export async function startConsumer() {
    await consumer.connect();

    await consumer.subscribe({
        topics: [
            "notification-events",
            "notification-critical",
        ],
        fromBeginning: true,
    });

    await consumer.run({
        autoCommit: false,
        partitionsConsumedConcurrently: boundedPositiveInteger(
            process.env.KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY,
            1,
            "KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY",
        ),

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

                debugPipelineLog(`Committed offset ${payload.message.offset}`);
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
    await redisPool.close();

    await prisma.$disconnect();
    await postgresPool.end();
}
