import type { Logger } from "pino";

export interface ShutdownTask {
    name: string;
    stopIntake?(): Promise<void>;
    drain?(): Promise<void>;
    close(): Promise<void>;
}

export interface ShutdownReport {
    completed: string[];
    failures: Array<{ task: string; message: string }>;
}

/** Stops intake, drains work, and closes resources in deterministic order. */
export class GracefulShutdownManager {
    private shuttingDown = false;

    constructor(private readonly tasks: readonly ShutdownTask[], private readonly logger: Logger) { }

    async shutdown(): Promise<ShutdownReport> {
        if (this.shuttingDown) return { completed: [], failures: [] };
        this.shuttingDown = true;
        const report: ShutdownReport = { completed: [], failures: [] };
        for (const task of this.tasks) await this.run(task, "stopIntake", report);
        for (const task of this.tasks) await this.run(task, "drain", report);
        for (const task of [...this.tasks].reverse()) await this.run(task, "close", report);
        return report;
    }

    private async run(task: ShutdownTask, phase: "stopIntake" | "drain" | "close", report: ShutdownReport): Promise<void> {
        const operation = task[phase];
        if (!operation) return;
        try {
            await operation();
            report.completed.push(`${task.name}:${phase}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Shutdown operation failed";
            this.logger.error({ err: error, task: task.name, phase }, "Graceful shutdown operation failed");
            report.failures.push({ task: `${task.name}:${phase}`, message });
        }
    }
}

/** Registers SIGINT/SIGTERM handling for an application's startup composition root. */
export function registerGracefulShutdownSignals(
    manager: GracefulShutdownManager,
    logger: Logger,
    exit: (code: number) => never = process.exit,
): void {
    let received = false;
    const handleSignal = (signal: NodeJS.Signals) => {
        if (received) return;
        received = true;
        logger.info({ signal }, "Graceful shutdown started");
        manager.shutdown().then((report) => {
            const exitCode = report.failures.length === 0 ? 0 : 1;
            logger.info({ signal, ...report, exitCode }, "Graceful shutdown completed");
            exit(exitCode);
        }).catch((error: unknown) => {
            logger.fatal({ err: error, signal }, "Graceful shutdown failed");
            exit(1);
        });
    };
    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
}
