import { describe, expect, it } from "vitest";

import {
    NotificationChannel,
} from "../../generated/prisma/enums";

import { EventRoutingService } from "../service";

describe("EventRoutingService", () => {
    const service = new EventRoutingService();

    it("routes an enriched event to all resolved channels", () => {
        const enrichedEvent = {
            event: {
                eventId: "event-001",
                eventType: "TXNX-001",
                eventCategory: "transaction",
                userId: "user-001",
                occurredAt:
                    new Date().toISOString(),
                correlationId: "correlation-001",
                source: "test",
                priority: "HIGH",

                stockName: "RELIANCE",
                quantity: 10,
                price: 2500,
                total: 25000,
                portfolioImpact: 25000,
            },

            user: {
                id: "user-001",
                phone: "+919000000001",
                email: "user@example.com",
                name: "Test User",
                language: "en",
                timezone: "Asia/Kolkata",
            },

            channels: [
                {
                    channel:
                        NotificationChannel.SMS,
                    source: "SYSTEM_DEFAULT",
                    mandatory: false,
                },
                {
                    channel:
                        NotificationChannel.PUSH,
                    source: "USER_PREFERENCE",
                    mandatory: false,
                },
                {
                    channel:
                        NotificationChannel.EMAIL,
                    source: "SYSTEM_DEFAULT",
                    mandatory: false,
                },
            ],
        } as any;

        const result =
            service.route(enrichedEvent);

        expect(result.eventId).toBe(
            "event-001",
        );

        expect(result.eventType).toBe(
            "TXNX-001",
        );

        expect(result.routes).toHaveLength(3);

        expect(result.routes[0]).toMatchObject({
            channel: NotificationChannel.PUSH,
            source: "USER_PREFERENCE",
            mandatory: false,
        });

        expect(result.routes[1]).toMatchObject({
            channel: NotificationChannel.SMS,
            source: "SYSTEM_DEFAULT",
            mandatory: false,
        });

        expect(
            result.routes.map(
                (route) => route.channel,
            ),
        ).toEqual([
            NotificationChannel.PUSH,
            NotificationChannel.SMS,
            NotificationChannel.EMAIL,
        ]);
    });

    it("preserves regulatory routing decisions", () => {
        const enrichedEvent = {
            event: {
                eventId: "event-002",
                eventType: "RISK-001",
                eventCategory: "risk_margin",
                userId: "user-001",
                occurredAt:
                    new Date().toISOString(),
                correlationId: "correlation-002",
                source: "test",
                priority: "CRITICAL",

                shortfallAmount: 100000,
                deadline:
                    "2026-08-18T15:00:00Z",
                liquidationRisk: "HIGH",
            },

            user: {
                id: "user-001",
                phone: "+919000000001",
                email: "user@example.com",
                name: "Test User",
                language: "en",
                timezone: "Asia/Kolkata",
            },

            channels: [
                {
                    channel:
                        NotificationChannel.SMS,
                    source:
                        "REGULATORY_OVERRIDE",
                    mandatory: true,
                },
                {
                    channel:
                        NotificationChannel.PUSH,
                    source:
                        "REGULATORY_OVERRIDE",
                    mandatory: true,
                },
            ],
        } as any;

        const result =
            service.route(enrichedEvent);

        expect(result.priority).toBe(
            "CRITICAL",
        );

        expect(
            result.routes.every(
                (route) =>
                    route.mandatory === true,
            ),
        ).toBe(true);

        expect(
            result.routes.every(
                (route) =>
                    route.source ===
                    "REGULATORY_OVERRIDE",
            ),
        ).toBe(true);
    });

    it("preserves event priority on every route", () => {
        const enrichedEvent = {
            event: {
                eventId: "event-003",
                eventType: "MKTX-001",
                eventCategory: "market_price",
                userId: "user-001",
                occurredAt:
                    new Date().toISOString(),
                correlationId: "correlation-003",
                source: "test",
                priority: "NORMAL",

                stock: "NIFTY",
                targetPrice: 25000,
                currentPrice: 25100,
                direction: "UP",
            },

            user: {
                id: "user-001",
                phone: "+919000000001",
                email: "user@example.com",
                name: "Test User",
                language: "en",
                timezone: "Asia/Kolkata",
            },

            channels: [
                {
                    channel:
                        NotificationChannel.PUSH,
                    source: "SYSTEM_DEFAULT",
                    mandatory: false,
                },
                {
                    channel:
                        NotificationChannel.SMS,
                    source: "SYSTEM_DEFAULT",
                    mandatory: false,
                },
            ],
        } as any;

        const result =
            service.route(enrichedEvent);

        expect(
            result.routes.every(
                (route) =>
                    route.priority ===
                    "NORMAL",
            ),
        ).toBe(true);
    });
});

