import type { NotificationChannel } from "../generated/prisma/enums";

export type ProviderHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface ProviderHealth {
    provider: string;
    channel: NotificationChannel;
    status: ProviderHealthStatus;
    checkedAt: string;
    responseTimeMs: number;
    message?: string;
}

export interface HealthCheckableProvider {
    readonly provider: string;
    readonly channel: NotificationChannel;
    checkHealth(): Promise<ProviderHealth>;
}

/** Runs every provider health check without allowing one failure to hide others. */
export class ProviderHealthCheckService {
    async checkAll(providers: HealthCheckableProvider[]): Promise<ProviderHealth[]> {
        return Promise.all(providers.map(async (provider) => {
            const startedAt = Date.now();
            try {
                return await provider.checkHealth();
            } catch (error) {
                return {
                    provider: provider.provider,
                    channel: provider.channel,
                    status: "UNAVAILABLE",
                    checkedAt: new Date().toISOString(),
                    responseTimeMs: Date.now() - startedAt,
                    message: error instanceof Error ? error.message : "Health check failed",
                };
            }
        }));
    }
}
