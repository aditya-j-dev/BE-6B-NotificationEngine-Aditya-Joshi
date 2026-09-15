import type { NotificationChannel } from "../generated/prisma/enums";

import type { ChannelRealtimeMetrics } from "./realtime";

const CHANNELS: NotificationChannel[] = ["SMS", "EMAIL", "PUSH", "WHATSAPP", "IN_APP"];

export interface ChannelMetricsSnapshotSource {
    snapshot(channel: NotificationChannel): Promise<ChannelRealtimeMetrics>;
}

/** Renders current ZeTheta delivery metrics in Prometheus 0.0.4 text format. */
export class PrometheusMetricsService {
    constructor(
        private readonly source: ChannelMetricsSnapshotSource,
        private readonly channels: readonly NotificationChannel[] = CHANNELS,
    ) { }

    async render(): Promise<string> {
        const snapshots = await Promise.all(this.channels.map((channel) => this.source.snapshot(channel)));
        const lines = [
            "# HELP zetheta_delivery_attempts_total Delivery attempts grouped by channel and outcome.",
            "# TYPE zetheta_delivery_attempts_total counter",
            ...snapshots.flatMap((snapshot) => [
                this.sample("zetheta_delivery_attempts_total", snapshot.channel, "success", snapshot.deliveries),
                this.sample("zetheta_delivery_attempts_total", snapshot.channel, "failure", snapshot.failures),
            ]),
            "# HELP zetheta_delivery_latency_milliseconds Provider response latency by channel.",
            "# TYPE zetheta_delivery_latency_milliseconds summary",
            ...snapshots.flatMap((snapshot) => [
                this.channelSample("zetheta_delivery_latency_milliseconds_sum", snapshot.channel, snapshot.latencyTotalMs),
                this.channelSample("zetheta_delivery_latency_milliseconds_count", snapshot.channel, snapshot.latencySamples),
            ]),
        ];
        return `${lines.join("\n")}\n`;
    }

    private sample(name: string, channel: NotificationChannel, outcome: "success" | "failure", value: number): string {
        return `${name}{channel="${channel}",outcome="${outcome}"} ${value}`;
    }

    private channelSample(name: string, channel: NotificationChannel, value: number): string {
        return `${name}{channel="${channel}"} ${value}`;
    }
}
