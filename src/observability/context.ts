import { AsyncLocalStorage } from "node:async_hooks";

interface ObservabilityContext {
    correlationId: string;
}

const context = new AsyncLocalStorage<ObservabilityContext>();

export function runWithCorrelationId<T>(correlationId: string, operation: () => T): T {
    return context.run({ correlationId }, operation);
}

export function correlationId(): string | undefined {
    return context.getStore()?.correlationId;
}
