import { describe, expect, it, vi } from "vitest";

import { RedisConnectionPool, type RedisPoolClient } from "../redis-pool";

describe("RedisConnectionPool", () => {
    it("creates auto-pipelined clients and distributes requests round-robin", async () => {
        const first = { set: vi.fn(), quit: vi.fn(async () => "OK") } as unknown as RedisPoolClient;
        const second = { set: vi.fn(), quit: vi.fn(async () => "OK") } as unknown as RedisPoolClient;
        const factory = vi.fn()
            .mockReturnValueOnce(first)
            .mockReturnValueOnce(second);
        const pool = new RedisConnectionPool("redis://example", { size: 2 }, factory);

        expect(pool.next()).toBe(first);
        expect(pool.next()).toBe(second);
        expect(pool.next()).toBe(first);
        expect(factory).toHaveBeenCalledWith("redis://example", expect.objectContaining({ enableAutoPipelining: true }));

        await pool.close();
        expect(first.quit).toHaveBeenCalledOnce();
        expect(second.quit).toHaveBeenCalledOnce();
    });

    it("rejects invalid pool sizes", () => {
        expect(() => new RedisConnectionPool("redis://example", { size: 0 })).toThrow("positive integer");
    });
});
