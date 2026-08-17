import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { NotificationChannel } from "../src/generated/prisma/enums";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const channels: NotificationChannel[] = [
    "SMS",
    "EMAIL",
    "PUSH",
    "WHATSAPP",
    "IN_APP",
];

const eventCategories = [
    "transaction",
    "risk_margin",
    "sip_investment",
    "market_price",
    "regulatory_compliance",
] as const;

const categoryEventTypes: Record<
    (typeof eventCategories)[number],
    string[]
> = {
    transaction: [
        "TXNX-001",
        "TXNX-002",
        "TXNX-003",
        "TXNX-004",
        "TXNX-005",
    ],

    risk_margin: [
        "RISK-001",
        "RISK-002",
        "RISK-003",
        "RISK-004",
        "RISK-005",
    ],

    sip_investment: [
        "SIPX-001",
        "SIPX-002",
        "SIPX-003",
        "SIPX-004",
        "SIPX-005",
    ],

    market_price: [
        "MKTX-001",
        "MKTX-002",
        "MKTX-003",
        "MKTX-004",
        "MKTX-005",
    ],

    regulatory_compliance: [
        "REGX-001",
        "REGX-002",
        "REGX-003",
        "REGX-004",
        "REGX-005",
    ],
};

const languages = ["en", "hi", "bn", "ta", "te"];

const timezones = [
    "Asia/Kolkata",
    "Asia/Dubai",
    "Asia/Singapore",
    "Europe/London",
];

const digestModes = ["immediate", "hourly", "daily"];

function randomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function randomBoolean(probability = 0.5): boolean {
    return Math.random() < probability;
}

async function main() {
    console.log("Creating 1,000 test users...");

    for (let i = 1; i <= 1000; i++) {
        const user = await prisma.user.create({
            data: {
                phone: `+919000${String(i).padStart(6, "0")}`,
                email: `testuser${i}@example.com`,
                name: `Test User ${i}`,
                language: randomItem(languages),
                timezone: randomItem(timezones),
            },
        });

        const preferences = [];

        for (const category of eventCategories) {
            const availableEventTypes = categoryEventTypes[category];

            // Each user receives preferences for a random
            // subset of events in each category.
            const selectedEventTypes = availableEventTypes.filter(() =>
                randomBoolean(0.6)
            );

            for (const eventType of selectedEventTypes) {
                // Each event gets preferences for a random
                // subset of available channels.
                const selectedChannels = channels.filter(() =>
                    randomBoolean(0.7)
                );

                for (const channel of selectedChannels) {
                    preferences.push({
                        userId: user.id,
                        eventCategory: category,
                        eventType,
                        channel,
                        enabled: randomBoolean(0.8),
                        quietHoursOverride: randomBoolean(0.2),
                        digestMode: randomItem(digestModes),
                        priorityOverride: randomBoolean(0.2)
                            ? Math.floor(Math.random() * 5) + 1
                            : null,
                    });
                }
            }
        }

        if (preferences.length > 0) {
            await prisma.userPreference.createMany({
                data: preferences,
            });
        }

        if (i % 100 === 0) {
            console.log(`Created ${i}/1000 users`);
        }
    }

    console.log("Seed completed successfully.");
}

main()
    .catch((error) => {
        console.error("Seed failed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });