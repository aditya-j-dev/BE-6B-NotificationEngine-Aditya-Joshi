import { describe, expect, it } from "vitest";

import { NotificationChannel } from "../../generated/prisma/enums";

import {
    EventEnrichmentService,
} from "../service";

import type { FinancialEvent } from "../../events/types";

function createEvent(
    overrides: Partial<FinancialEvent> = {},
): FinancialEvent {
    return {
        eventId: "event-001",
        eventType: "TXNX-001",
        eventCategory: "transaction",
        userId: "user-001",
        occurredAt: new Date().toISOString(),
        correlationId: "correlation-001",
        source: "test",
        priority: "HIGH",

        stockName: "RELIANCE",
        quantity: 10,
        price: 2500,
        total: 25000,
        portfolioImpact: 25000,

        ...overrides,
    } as FinancialEvent;
}

describe("EventEnrichmentService", () => {
    it("resolves user context and system channels", async () => {
        const prisma = {
            user: {
                findUnique: async () => ({
                    id: "user-001",
                    phone: "+919000000001",
                    email: "user@example.com",
                    name: "Test User",
                    language: "en",
                    timezone: "Asia/Kolkata",
                }),
            },
            userPreference: {
                findMany: async () => [],
            },
        } as any;

        const service =
            new EventEnrichmentService(prisma);

        const result = await service.enrich(
            createEvent(),
        );

        expect(result.user.language).toBe("en");

        expect(
            result.channels.map(
                (channel) => channel.channel,
            ),
        ).toEqual(
            expect.arrayContaining([
                NotificationChannel.SMS,
                NotificationChannel.PUSH,
                NotificationChannel.EMAIL,
            ]),
        );
    });

    it("allows explicit user preferences to disable a default channel", async () => {
        const prisma = {
            user: {
                findUnique: async () => ({
                    id: "user-001",
                    phone: "+919000000001",
                    email: "user@example.com",
                    name: "Test User",
                    language: "en",
                    timezone: "Asia/Kolkata",
                }),
            },

            userPreference: {
                findMany: async () => [
                    {
                        eventCategory: "transaction",
                        eventType: "TXNX-004",
                        channel: NotificationChannel.EMAIL,
                        enabled: false,
                    },
                ],
            },
        } as any;

        const service =
            new EventEnrichmentService(prisma);

        const result = await service.enrich({
            eventId: "event-001",
            eventType: "TXNX-004",
            eventCategory: "transaction",
            userId: "user-001",
            occurredAt: new Date().toISOString(),
            correlationId: "correlation-001",
            source: "test",
            priority: "NORMAL",

            company: "RELIANCE",
            amount: 500,
            recordDate: "2026-08-18",
            bankAccount: "XXXX1234",
        });

        expect(
            result.channels.some(
                (channel) =>
                    channel.channel ===
                    NotificationChannel.EMAIL,
            ),
        ).toBe(false);
    });

    it("regulatory channels override disabled user preferences", async () => {
        const prisma = {
            user: {
                findUnique: async () => ({
                    id: "user-001",
                    phone: "+919000000001",
                    email: "user@example.com",
                    name: "Test User",
                    language: "en",
                    timezone: "Asia/Kolkata",
                }),
            },
            userPreference: {
                findMany: async () => [
                    {
                        eventCategory: "risk_margin",
                        eventType: "RISK-001",
                        channel: NotificationChannel.SMS,
                        enabled: false,
                    },
                    {
                        eventCategory: "risk_margin",
                        eventType: "RISK-001",
                        channel: NotificationChannel.PUSH,
                        enabled: false,
                    },
                ],
            },
        } as any;

        const service =
            new EventEnrichmentService(prisma);

        const result = await service.enrich(
            createEvent({
                eventType: "RISK-001",
                eventCategory: "risk_margin",
                priority: "CRITICAL",

                shortfallAmount: 100000,
                deadline: "2026-08-18T15:00:00Z",
                liquidationRisk: "HIGH",
            }),
        );

        const sms =
            result.channels.find(
                (channel) =>
                    channel.channel ===
                    NotificationChannel.SMS,
            );

        const push =
            result.channels.find(
                (channel) =>
                    channel.channel ===
                    NotificationChannel.PUSH,
            );

        expect(sms?.mandatory).toBe(true);
        expect(push?.mandatory).toBe(true);

        expect(sms?.source).toBe(
            "REGULATORY_OVERRIDE",
        );

        expect(push?.source).toBe(
            "REGULATORY_OVERRIDE",
        );
    });
});