import Redis from "ioredis";

export interface RedisPoolClient {
    set(key: string, value: string, mode: "EX", ttlSeconds: number, nx: "NX"): Promise<"OK" | null>;
    quit(): Promise<unknown>;
}

export interface RedisConnectionPoolOptions {
    size?: number;
    maxRetriesPerRequest?: number;
    connectTimeoutMs?: number;
}

export type RedisPoolClientFactory = (
    redisUrl: string,
    options: { enableAutoPipelining: boolean; maxRetriesPerRequest: number; connectTimeout: number },
) => RedisPoolClient;

/** Small round-robin Redis pool for the high-throughput ingestion path. */
export class RedisConnectionPool {
    private readonly clients: RedisPoolClient[];
    private nextIndex = 0;

    constructor(
        redisUrl: string,
        options: RedisConnectionPoolOptions = {},
        clientFactory: RedisPoolClientFactory = (url, redisOptions) => new Redis(url, redisOptions),
    ) {
        const size = options.size ?? 8;
        if (!Number.isInteger(size) || size < 1) throw new Error("Redis pool size must be a positive integer");
        const maxRetriesPerRequest = options.maxRetriesPerRequest ?? 3;
        const connectTimeout = options.connectTimeoutMs ?? 5_000;
        this.clients = Array.from({ length: size }, () => clientFactory(redisUrl, {
            enableAutoPipelining: true,
            maxRetriesPerRequest,
            connectTimeout,
        }));
    }

    next(): RedisPoolClient {
        const client = this.clients[this.nextIndex];
        this.nextIndex = (this.nextIndex + 1) % this.clients.length;
        if (!client) throw new Error("Redis connection pool has no clients");
        return client;
    }

    async close(): Promise<void> {
        await Promise.all(this.clients.map((client) => client.quit()));
    }
}
