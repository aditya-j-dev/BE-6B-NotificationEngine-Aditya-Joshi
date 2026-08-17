import { createTestEvent } from "./factory";

const eventTypes = [
    "TXNX-001",
    "TXNX-002",
    "TXNX-003",
    "TXNX-004",
    "TXNX-005",

    "RISK-001",
    "RISK-002",
    "RISK-003",
    "RISK-004",
    "RISK-005",

    "SIPX-001",
    "SIPX-002",
    "SIPX-003",
    "SIPX-004",
    "SIPX-005",

    "MKTX-001",
    "MKTX-002",
    "MKTX-003",
    "MKTX-004",
    "MKTX-005",

    "REGX-001",
    "REGX-002",
    "REGX-003",
    "REGX-004",
    "REGX-005",
] as const;

for (const eventType of eventTypes) {
    const event = createTestEvent(eventType);

    console.log(
        `✓ ${event.eventType} - ${event.eventCategory}`,
    );
}

console.log(`\nGenerated ${eventTypes.length} events successfully.`);