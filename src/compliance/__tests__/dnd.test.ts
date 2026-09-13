import { describe, expect, it } from "vitest";

import {
    DndLookupService,
    InvalidPhoneNumberError,
    RedisDndCache,
    SimulatedDndRegistry,
    type DndCache,
    type DndRegistry,
} from "../index";

const registeredPhone = "+919876543210";
const unregisteredPhone = "+919876543211";

class MemoryDndCache implements DndCache {
    readonly values = new Map<string, boolean>();
    getCalls = 0;
    setCalls = 0;
    fail = false;

    async get(phone: string): Promise<boolean | null> {
        this.getCalls += 1;
        if (this.fail) {
            throw new Error("Redis unavailable");
        }
        return this.values.get(phone) ?? null;
    }

    async set(phone: string, registered: boolean): Promise<void> {
        this.setCalls += 1;
        if (this.fail) {
            throw new Error("Redis unavailable");
        }
        this.values.set(phone, registered);
    }

    async invalidate(phone: string): Promise<void> {
        this.values.delete(phone);
    }
}

describe("DndLookupService", () => {
    it("returns an authoritative simulated registry match on a cache miss", async () => {
        const registry = new SimulatedDndRegistry([{
            phone: registeredPhone,
            registeredAt: "2026-09-01T00:00:00.000Z",
        }]);
        const cache = new MemoryDndCache();
        const service = new DndLookupService(registry, cache);

        await expect(service.lookup(registeredPhone)).resolves.toEqual({
            phone: registeredPhone,
            registered: true,
            source: "REGISTRY",
        });
        expect(cache.values.get(registeredPhone)).toBe(true);
    });

    it("uses a cached DND result without calling the registry", async () => {
        const cache = new MemoryDndCache();
        cache.values.set(registeredPhone, true);
        const registry: DndRegistry = {
            lookup: async () => {
                throw new Error("Registry should not be called");
            },
        };
        const service = new DndLookupService(registry, cache);

        await expect(service.lookup(registeredPhone)).resolves.toEqual({
            phone: registeredPhone,
            registered: true,
            source: "CACHE",
        });
    });

    it("caches not-registered results as well as registered results", async () => {
        const cache = new MemoryDndCache();
        const service = new DndLookupService(new SimulatedDndRegistry(), cache);

        await expect(service.lookup(unregisteredPhone)).resolves.toMatchObject({
            registered: false,
            source: "REGISTRY",
        });
        await expect(service.lookup(unregisteredPhone)).resolves.toMatchObject({
            registered: false,
            source: "CACHE",
        });
    });

    it("falls back to the registry when the cache is unavailable", async () => {
        const cache = new MemoryDndCache();
        cache.fail = true;
        const service = new DndLookupService(new SimulatedDndRegistry([{
            phone: registeredPhone,
            registeredAt: "2026-09-01T00:00:00.000Z",
        }]), cache);

        await expect(service.lookup(registeredPhone)).resolves.toMatchObject({
            registered: true,
            source: "REGISTRY",
        });
    });

    it("rejects a phone number that is not E.164", async () => {
        const service = new DndLookupService(new SimulatedDndRegistry());

        await expect(service.lookup("9876543210"))
            .rejects.toBeInstanceOf(InvalidPhoneNumberError);
    });

    it("invalidates a stale cache entry so the next lookup reaches the registry", async () => {
        const cache = new MemoryDndCache();
        cache.values.set(registeredPhone, false);
        const service = new DndLookupService(new SimulatedDndRegistry([{
            phone: registeredPhone,
            registeredAt: "2026-09-01T00:00:00.000Z",
        }]), cache);

        await service.invalidate(registeredPhone);

        await expect(service.lookup(registeredPhone)).resolves.toEqual({
            phone: registeredPhone,
            registered: true,
            source: "REGISTRY",
        });
    });

    it("returns the registry result even when a cache write fails", async () => {
        const cache = new MemoryDndCache();
        cache.fail = true;
        const service = new DndLookupService(new SimulatedDndRegistry([{
            phone: registeredPhone,
            registeredAt: "2026-09-01T00:00:00.000Z",
        }]), cache);

        await expect(service.lookup(registeredPhone)).resolves.toMatchObject({
            registered: true,
            source: "REGISTRY",
        });
    });
});

describe("RedisDndCache", () => {
    it("stores namespaced positive and negative values with a TTL", async () => {
        const calls: unknown[][] = [];
        const cache = new RedisDndCache({
            get: async () => null,
            set: async (...args: unknown[]) => {
                calls.push(args);
                return "OK";
            },
            del: async () => 1,
        }, 60);

        await cache.set(registeredPhone, true);
        await cache.set(unregisteredPhone, false);

        expect(calls).toEqual([
            ["notification:dnd:%2B919876543210", "registered", "EX", 60],
            ["notification:dnd:%2B919876543211", "not_registered", "EX", 60],
        ]);
    });

    it("removes a corrupt cached value and reports a cache miss", async () => {
        const deleted: string[] = [];
        const cache = new RedisDndCache({
            get: async () => "unexpected",
            set: async () => "OK",
            del: async (key: string) => {
                deleted.push(key);
                return 1;
            },
        });

        await expect(cache.get(registeredPhone)).resolves.toBeNull();
        expect(deleted).toEqual(["notification:dnd:%2B919876543210"]);
    });
});
