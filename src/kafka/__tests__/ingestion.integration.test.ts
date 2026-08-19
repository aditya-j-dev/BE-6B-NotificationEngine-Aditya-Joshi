import "dotenv/config";

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from "vitest";

import { Kafka, Consumer } from "kafkajs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

import type { FinancialEvent } from "../../events/types";

import {
    publishEvent,
    disconnectKafkaProducer,
} from "../producer";

import { deserializeEvent } from "../avro";

import {
    EventDeduplicationService,
} from "../../deduplication/service";

import {
    EventEnrichmentService,
} from "../../enrichment/service";

import {
    EventRoutingService,
} from "../../routing/service";

import {
    NotificationPipeline,
} from "../pipeline";

describe(
    "Kafka ingestion pipeline",
    () => {
        const kafka = new Kafka({
            clientId:
                "notification-engine-integration-test",
            brokers: [
                process.env.KAFKA_BROKERS ??
                "localhost:9092",
            ],
        });

        let consumer: Consumer;
        let prisma: PrismaClient;
        let deduplication:
            EventDeduplicationService;
        let pipeline: NotificationPipeline;

        const groupId =
            `notification-integration-${Date.now()}`;

        beforeAll(async () => {
            const adapter = new PrismaPg({
                connectionString:
                    process.env.DATABASE_URL,
            });

            prisma = new PrismaClient({
                adapter,
            });

            deduplication =
                new EventDeduplicationService(
                    process.env.REDIS_URL ??
                    "redis://localhost:6380",
                    60,
                );

            const enrichment =
                new EventEnrichmentService(
                    prisma,
                );

            const routing =
                new EventRoutingService();

            pipeline =
                new NotificationPipeline(
                    deduplication,
                    enrichment,
                    routing,
                );

            consumer = kafka.consumer({
                groupId,
            });

            await consumer.connect();

            await consumer.subscribe({
                topic: "notification-events",
                fromBeginning: false,
            });
        });

        afterAll(async () => {
            await consumer.disconnect();

            await deduplication.close();

            await prisma.$disconnect();

            await disconnectKafkaProducer();
        });

        it(
            "produces, consumes, deduplicates, enriches and routes an event",
            async () => {
                const user =
                    await prisma.user.findFirst({
                        where: {
                            email: {
                                startsWith:
                                    "testuser",
                            },
                        },
                    });

                expect(user).not.toBeNull();

                const eventId =
                    `integration-${Date.now()}-${Math.random()}`;

                const event:
                    FinancialEvent = {
                    eventId,

                    eventType: "TXNX-001",

                    eventCategory:
                        "transaction",

                    userId: user!.id,

                    occurredAt:
                        new Date().toISOString(),

                    correlationId:
                        `correlation-${Date.now()}`,

                    source:
                        "integration-test",

                    priority: "HIGH",

                    stockName: "RELIANCE",

                    quantity: 10,

                    price: 2500,

                    total: 25000,

                    portfolioImpact: 25000,
                };

                /*
                 * Prepare the promise that will be resolved
                 * when the integration consumer receives
                 * and processes our event.
                 */
                const resultPromise =
                    new Promise<{
                        duplicate: boolean;
                        eventType: string;
                        routes: string[];
                    }>(
                        (resolve, reject) => {
                            const timeout =
                                setTimeout(() => {
                                    reject(
                                        new Error(
                                            "Timed out waiting for Kafka event",
                                        ),
                                    );
                                }, 15000);

                            /*
                             * Start the dedicated integration
                             * consumer.
                             *
                             * Do NOT await consumer.run().
                             * KafkaJS keeps this running until
                             * the consumer is disconnected.
                             */
                            consumer.run({
                                eachMessage:
                                    async ({
                                        message,
                                        partition,
                                        topic,
                                    }) => {
                                        try {
                                            if (
                                                !message.value
                                            ) {
                                                return;
                                            }

                                            console.log(
                                                "Integration consumer received message:",
                                                {
                                                    topic,
                                                    key: message.key?.toString(),
                                                    partition,
                                                    offset: message.offset,
                                                },
                                            );

                                            /*
                                             * Decode the Avro payload.
                                             */
                                            const decoded =
                                                deserializeEvent(
                                                    message.value,
                                                );

                                            /*
                                             * Run the complete
                                             * application pipeline:
                                             *
                                             * Redis deduplication
                                             * → enrichment
                                             * → routing
                                             */
                                            const result =
                                                await pipeline.process(
                                                    decoded,
                                                );

                                            clearTimeout(
                                                timeout,
                                            );

                                            resolve({
                                                duplicate:
                                                    result.duplicate,

                                                eventType:
                                                    decoded.eventType,

                                                routes:
                                                    result
                                                        .routingDecision
                                                        ?.routes
                                                        .map(
                                                            (
                                                                route,
                                                            ) =>
                                                                route.channel,
                                                        ) ??
                                                    [],
                                            });
                                        } catch (error) {
                                            clearTimeout(
                                                timeout,
                                            );

                                            reject(
                                                error,
                                            );
                                        }
                                    },
                            });
                        },
                    );

                /*
                 * IMPORTANT:
                 *
                 * consumer.run() starts the consumer, but
                 * it does not mean the consumer has already
                 * joined the Kafka consumer group.
                 *
                 * Wait explicitly for GROUP_JOIN before
                 * publishing the event.
                 */
                const consumerJoined =
                    new Promise<void>(
                        (resolve) => {
                            consumer.on(
                                consumer.events
                                    .GROUP_JOIN,
                                () => {
                                    resolve();
                                },
                            );
                        },
                    );

                /*
                 * The consumer was started above.
                 * Wait until Kafka confirms that it has
                 * joined the group and received partitions.
                 */
                await consumerJoined;

                console.log(
                    "Integration consumer is ready.",
                );

                /*
                 * Now it is safe to publish the event.
                 */
                await publishEvent(event);

                console.log(
                    `Published integration event ${event.eventId}`,
                );

                /*
                 * Wait for:
                 *
                 * Kafka consume
                 * → Avro decode
                 * → Redis deduplication
                 * → enrichment
                 * → routing
                 */
                const result =
                    await resultPromise;

                expect(
                    result.duplicate,
                ).toBe(false);

                expect(
                    result.eventType,
                ).toBe("TXNX-001");

                expect(
                    result.routes,
                ).toContain("SMS");

                expect(
                    result.routes,
                ).toContain("PUSH");

                expect(
                    result.routes,
                ).toContain("EMAIL");
            },
            20000,
        );

        it(
            "deduplicates the same eventId",
            async () => {
                const user =
                    await prisma.user.findFirst({
                        where: {
                            email: {
                                startsWith:
                                    "testuser",
                            },
                        },
                    });

                expect(user).not.toBeNull();

                const eventId =
                    `duplicate-${Date.now()}-${Math.random()}`;

                const event:
                    FinancialEvent = {
                    eventId,

                    eventType: "TXNX-001",

                    eventCategory:
                        "transaction",

                    userId: user!.id,

                    occurredAt:
                        new Date().toISOString(),

                    correlationId:
                        `correlation-${Date.now()}`,

                    source:
                        "integration-test",

                    priority: "HIGH",

                    stockName: "RELIANCE",

                    quantity: 10,

                    price: 2500,

                    total: 25000,

                    portfolioImpact: 25000,
                };

                /*
                 * First processing:
                 * Redis key does not exist.
                 */
                const first =
                    await pipeline.process(
                        event,
                    );

                expect(
                    first.duplicate,
                ).toBe(false);

                expect(
                    first.routingDecision,
                ).toBeDefined();

                /*
                 * Process the exact same logical event again.
                 *
                 * Redis should recognize the eventId and
                 * prevent downstream processing.
                 */
                const second =
                    await pipeline.process(
                        event,
                    );

                expect(
                    second.duplicate,
                ).toBe(true);

                expect(
                    second.routingDecision,
                ).toBeUndefined();
            },
        );
    },
);