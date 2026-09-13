export interface DndRecord {
    phone: string;
    registeredAt: string;
}

export interface DndRegistry {
    lookup(phone: string): Promise<DndRecord | null>;
}

export interface DndCache {
    get(phone: string): Promise<boolean | null>;
    set(phone: string, registered: boolean): Promise<void>;
    invalidate(phone: string): Promise<void>;
}

export interface RedisDndClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
    del(key: string): Promise<number>;
}

export type DndLookupSource = "CACHE" | "REGISTRY";

export interface DndLookupResult {
    phone: string;
    registered: boolean;
    source: DndLookupSource;
}

export class InvalidPhoneNumberError extends Error {
    constructor(readonly phone: string) {
        super("DND lookup requires an E.164 phone number");
        this.name = "InvalidPhoneNumberError";
    }
}

/** In-memory stand-in for an external TRAI DND registry during development. */
export class SimulatedDndRegistry implements DndRegistry {
    private readonly records = new Map<string, DndRecord>();

    constructor(records: DndRecord[] = []) {
        records.forEach((record) => this.records.set(record.phone, record));
    }

    async lookup(phone: string): Promise<DndRecord | null> {
        return this.records.get(phone) ?? null;
    }

    register(record: DndRecord): void {
        this.records.set(record.phone, record);
    }

    unregister(phone: string): void {
        this.records.delete(phone);
    }
}

/** Redis cache for positive and negative DND registry results. */
export class RedisDndCache implements DndCache {
    constructor(
        private readonly redis: RedisDndClient,
        private readonly ttlSeconds = 900,
    ) { }

    async get(phone: string): Promise<boolean | null> {
        const key = this.key(phone);
        const cached = await this.redis.get(key);

        if (cached === null) {
            return null;
        }

        if (cached === "registered") {
            return true;
        }

        if (cached === "not_registered") {
            return false;
        }

        await this.redis.del(key);
        return null;
    }

    async set(phone: string, registered: boolean): Promise<void> {
        await this.redis.set(
            this.key(phone),
            registered ? "registered" : "not_registered",
            "EX",
            this.ttlSeconds,
        );
    }

    async invalidate(phone: string): Promise<void> {
        await this.redis.del(this.key(phone));
    }

    private key(phone: string): string {
        return `notification:dnd:${encodeURIComponent(phone)}`;
    }
}

/** Resolves DND status from cache first, with the registry as the source of truth. */
export class DndLookupService {
    constructor(
        private readonly registry: DndRegistry,
        private readonly cache?: DndCache,
    ) { }

    async lookup(phone: string): Promise<DndLookupResult> {
        this.assertE164(phone);
        const cached = await this.readCache(phone);

        if (cached !== null) {
            return { phone, registered: cached, source: "CACHE" };
        }

        const registered = (await this.registry.lookup(phone)) !== null;
        await this.writeCache(phone, registered);

        return { phone, registered, source: "REGISTRY" };
    }

    async invalidate(phone: string): Promise<void> {
        this.assertE164(phone);

        try {
            await this.cache?.invalidate(phone);
        } catch {
            // Registry reads remain correct if a cache invalidation is delayed.
        }
    }

    private assertE164(phone: string): void {
        if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
            throw new InvalidPhoneNumberError(phone);
        }
    }

    private async readCache(phone: string): Promise<boolean | null> {
        try {
            return await this.cache?.get(phone) ?? null;
        } catch {
            return null;
        }
    }

    private async writeCache(phone: string, registered: boolean): Promise<void> {
        try {
            await this.cache?.set(phone, registered);
        } catch {
            // A DND cache failure must not hide a registry result.
        }
    }
}
