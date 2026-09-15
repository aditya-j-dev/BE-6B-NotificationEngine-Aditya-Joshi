import type { IncomingMessage, ServerResponse } from "node:http";

import type { HealthCheckableProvider, ProviderHealthCheckService } from "../providers";

export type HealthState = "UP" | "DOWN";

export interface HealthDependency {
    name: "postgres" | "redis" | "kafka" | "rabbitmq";
    check(): Promise<void>;
}

export interface HealthComponent {
    name: string;
    state: HealthState;
    latencyMs: number;
    message?: string;
}

export interface HealthReport {
    status: "HEALTHY" | "UNHEALTHY";
    checkedAt: string;
    components: HealthComponent[];
}

const REQUIRED_DEPENDENCIES: HealthDependency["name"][] = ["postgres", "redis", "kafka", "rabbitmq"];

/** Checks every core dependency and every configured delivery provider. */
export class HealthService {
    constructor(
        private readonly dependencies: readonly HealthDependency[],
        private readonly providers: readonly HealthCheckableProvider[] = [],
        private readonly providerHealth: ProviderHealthCheckService,
        private readonly now: () => Date = () => new Date(),
        private readonly timeoutMs = 5_000,
    ) { }

    async readiness(): Promise<HealthReport> {
        const configured = new Map(this.dependencies.map((dependency) => [dependency.name, dependency]));
        const dependencyChecks = REQUIRED_DEPENDENCIES.map(async (name) => {
            const dependency = configured.get(name);
            if (!dependency) return { name, state: "DOWN" as const, latencyMs: 0, message: "Health check is not configured" };
            return this.checkDependency(dependency);
        });
        const providerChecks = this.providerHealth.checkAll([...this.providers]).then((providers) => providers.map((provider) => ({
            name: `provider:${provider.provider}`,
            state: provider.status === "HEALTHY" ? "UP" as const : "DOWN" as const,
            latencyMs: provider.responseTimeMs,
            ...(provider.message ? { message: provider.message } : {}),
        })));
        const components = [...await Promise.all(dependencyChecks), ...await providerChecks];
        return {
            status: components.every((component) => component.state === "UP") ? "HEALTHY" : "UNHEALTHY",
            checkedAt: this.now().toISOString(),
            components,
        };
    }

    liveness(): { status: "HEALTHY"; checkedAt: string } {
        return { status: "HEALTHY", checkedAt: this.now().toISOString() };
    }

    private async checkDependency(dependency: HealthDependency): Promise<HealthComponent> {
        const startedAt = performance.now();
        try {
            await Promise.race([
                dependency.check(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Health check timed out")), this.timeoutMs)),
            ]);
            return { name: dependency.name, state: "UP", latencyMs: Number((performance.now() - startedAt).toFixed(2)) };
        } catch (error) {
            return {
                name: dependency.name,
                state: "DOWN",
                latencyMs: Number((performance.now() - startedAt).toFixed(2)),
                message: error instanceof Error ? error.message : "Health check failed",
            };
        }
    }
}

export function createHealthApiHandler(service: HealthService) {
    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (request.method !== "GET") {
            response.writeHead(405, { allow: "GET" });
            response.end();
            return;
        }
        if (pathname === "/health/live") {
            response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify(service.liveness()));
            return;
        }
        if (pathname === "/health" || pathname === "/health/ready") {
            const report = await service.readiness();
            response.writeHead(report.status === "HEALTHY" ? 200 : 503, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify(report));
            return;
        }
        response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "NOT_FOUND" }));
    };
}
