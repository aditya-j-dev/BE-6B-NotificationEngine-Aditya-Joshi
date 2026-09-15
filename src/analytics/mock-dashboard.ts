import type { NotificationChannel } from "../generated/prisma/enums";

export interface MockDashboardChannelSnapshot {
    channel: NotificationChannel;
    delivered: number;
    failed: number;
    deliveryRate: number;
    averageLatencyMs: number;
    totalCostInr: number;
}

export interface MockDashboardTimePoint {
    bucketStart: string;
    delivered: number;
    failed: number;
    totalCostInr: number;
}

export interface MockDashboardDataset {
    generatedAt: string;
    period: { from: string; to: string };
    summary: {
        totalNotifications: number;
        deliveredNotifications: number;
        failedNotifications: number;
        deliveryRate: number;
        totalCostInr: number;
        optOuts: number;
    };
    channels: MockDashboardChannelSnapshot[];
    deliveryTimeline: MockDashboardTimePoint[];
    optOutTrends: Array<{ date: string; marketing: number; promotional: number; transactional: number }>;
}

const CHANNELS: MockDashboardChannelSnapshot[] = [
    { channel: "SMS", delivered: 4_210, failed: 126, deliveryRate: 0.9709, averageLatencyMs: 1_240, totalCostInr: 2_948.8 },
    { channel: "EMAIL", delivered: 8_740, failed: 87, deliveryRate: 0.9901, averageLatencyMs: 780, totalCostInr: 176.54 },
    { channel: "PUSH", delivered: 6_210, failed: 189, deliveryRate: 0.9705, averageLatencyMs: 310, totalCostInr: 0 },
    { channel: "WHATSAPP", delivered: 2_980, failed: 96, deliveryRate: 0.9688, averageLatencyMs: 920, totalCostInr: 1_538 },
    { channel: "IN_APP", delivered: 5_460, failed: 45, deliveryRate: 0.9918, averageLatencyMs: 140, totalCostInr: 0 },
];

/**
 * Stable fixture for frontend development and demos. It intentionally uses no
 * live customer data and remains deterministic for screenshots and tests.
 */
export function createMockDashboardDataset(): MockDashboardDataset {
    return {
        generatedAt: "2026-09-15T12:00:00.000Z",
        period: { from: "2026-09-09T00:00:00.000Z", to: "2026-09-15T12:00:00.000Z" },
        summary: {
            totalNotifications: 28_143,
            deliveredNotifications: 27_600,
            failedNotifications: 543,
            deliveryRate: 0.9807,
            totalCostInr: 4_663.34,
            optOuts: 38,
        },
        channels: CHANNELS.map((channel) => ({ ...channel })),
        deliveryTimeline: [
            { bucketStart: "2026-09-09T00:00:00.000Z", delivered: 3_720, failed: 88, totalCostInr: 604.2 },
            { bucketStart: "2026-09-10T00:00:00.000Z", delivered: 3_860, failed: 72, totalCostInr: 630.44 },
            { bucketStart: "2026-09-11T00:00:00.000Z", delivered: 3_980, failed: 81, totalCostInr: 656.16 },
            { bucketStart: "2026-09-12T00:00:00.000Z", delivered: 4_120, failed: 94, totalCostInr: 683.7 },
            { bucketStart: "2026-09-13T00:00:00.000Z", delivered: 4_050, failed: 77, totalCostInr: 670.4 },
            { bucketStart: "2026-09-14T00:00:00.000Z", delivered: 4_230, failed: 69, totalCostInr: 701.94 },
            { bucketStart: "2026-09-15T00:00:00.000Z", delivered: 3_640, failed: 62, totalCostInr: 716.5 },
        ],
        optOutTrends: [
            { date: "2026-09-09", marketing: 4, promotional: 1, transactional: 0 },
            { date: "2026-09-10", marketing: 5, promotional: 0, transactional: 1 },
            { date: "2026-09-11", marketing: 3, promotional: 2, transactional: 0 },
            { date: "2026-09-12", marketing: 6, promotional: 1, transactional: 0 },
            { date: "2026-09-13", marketing: 4, promotional: 1, transactional: 0 },
            { date: "2026-09-14", marketing: 5, promotional: 0, transactional: 1 },
            { date: "2026-09-15", marketing: 3, promotional: 1, transactional: 0 },
        ],
    };
}
