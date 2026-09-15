export interface CriticalAlert {
    rule: string;
    severity: "CRITICAL";
    message: string;
    observedAt: string;
}

export interface CriticalAlertNotifier {
    send(alert: CriticalAlert): Promise<void>;
}

export interface MonitoringSnapshot {
    observedAt: Date;
    errorRate: number;
    kafkaConsumerLag: number;
    unavailableProviders: string[];
    unhealthyDependencies: string[];
}

export interface CriticalAlertPolicy {
    errorRateThreshold: number;
    kafkaLagThreshold: number;
}

export const DEFAULT_CRITICAL_ALERT_POLICY: CriticalAlertPolicy = {
    errorRateThreshold: 0.05,
    kafkaLagThreshold: 10_000,
};

/** Evaluates critical operational failures; delivery is delegated to an existing notifier. */
export class CriticalAlertService {
    constructor(
        private readonly notifier: CriticalAlertNotifier,
        private readonly policy: CriticalAlertPolicy = DEFAULT_CRITICAL_ALERT_POLICY,
    ) { }

    async evaluate(snapshot: MonitoringSnapshot): Promise<CriticalAlert[]> {
        const alerts: CriticalAlert[] = [];
        if (snapshot.errorRate >= this.policy.errorRateThreshold) alerts.push(this.alert("error-rate", `Error rate ${(snapshot.errorRate * 100).toFixed(2)}% exceeds the critical threshold` , snapshot));
        if (snapshot.kafkaConsumerLag >= this.policy.kafkaLagThreshold) alerts.push(this.alert("kafka-consumer-lag", `Kafka consumer lag ${snapshot.kafkaConsumerLag} exceeds the critical threshold`, snapshot));
        if (snapshot.unavailableProviders.length > 0) alerts.push(this.alert("provider-unavailable", `Unavailable providers: ${snapshot.unavailableProviders.join(", ")}`, snapshot));
        if (snapshot.unhealthyDependencies.length > 0) alerts.push(this.alert("dependency-unhealthy", `Unhealthy dependencies: ${snapshot.unhealthyDependencies.join(", ")}`, snapshot));
        await Promise.all(alerts.map((alert) => this.notifier.send(alert)));
        return alerts;
    }

    private alert(rule: string, message: string, snapshot: MonitoringSnapshot): CriticalAlert {
        return { rule, severity: "CRITICAL", message, observedAt: snapshot.observedAt.toISOString() };
    }
}
