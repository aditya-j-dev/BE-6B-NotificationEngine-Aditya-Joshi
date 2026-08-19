import {
    beforeAll,
    afterAll,
    describe,
    expect,
    it,
} from "vitest";

import { Redis } from "ioredis";

import {
    EventDeduplicationService,
} from "../service";

describe("EventDeduplicationService", () => {
    let redis: Redis;
    let service: EventDeduplicationService;

    beforeAll(async () => {
        redis = new Redis(
            process.env.REDIS_URL ??
            "redis://localhost:6380",
        );

        service =
            new EventDeduplicationService(
                process.env.REDIS_URL ??
                "redis://localhost:6380",
                60,
            );
    });

    afterAll(async () => {
        await service.close();
        await redis.quit();
    });

    it("accepts a new event", async () => {
        const eventId =
            `test-new-${Date.now()}`;

        const duplicate =
            await service.isDuplicate(
                eventId,
            );

        expect(duplicate).toBe(false);
    });

    it("detects the same event as a duplicate", async () => {
        const eventId =
            `test-duplicate-${Date.now()}`;

        const first =
            await service.isDuplicate(
                eventId,
            );

        const second =
            await service.isDuplicate(
                eventId,
            );

        expect(first).toBe(false);
        expect(second).toBe(true);
    });

    it("allows the idempotency key to expire", async () => {
        const eventId =
            `test-ttl-${Date.now()}`;

        const shortTtlService =
            new EventDeduplicationService(
                process.env.REDIS_URL ??
                "redis://localhost:6380",
                1,
            );

        const first =
            await shortTtlService.isDuplicate(
                eventId,
            );

        expect(first).toBe(false);

        await new Promise((resolve) =>
            setTimeout(resolve, 1500),
        );

        const second =
            await shortTtlService.isDuplicate(
                eventId,
            );

        expect(second).toBe(false);

        await shortTtlService.close();
    });
});