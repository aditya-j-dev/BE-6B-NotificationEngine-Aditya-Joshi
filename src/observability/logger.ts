import pino, { type LevelWithSilent, type Logger } from "pino";

const LOG_LEVELS: readonly LevelWithSilent[] = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

export function resolveLogLevel(value: string | undefined): LevelWithSilent {
    const normalized = value?.toLowerCase();
    return LOG_LEVELS.includes(normalized as LevelWithSilent) ? normalized as LevelWithSilent : "info";
}

export function createLogger(environment: NodeJS.ProcessEnv = process.env): Logger {
    return pino({
        level: resolveLogLevel(environment.LOG_LEVEL),
        base: { service: "zetheta" },
        timestamp: pino.stdTimeFunctions.isoTime,
    });
}

export const applicationLogger = createLogger();
