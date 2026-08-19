import { createTestEvent } from "../events/factory";
import {
    publishEvent,
    disconnectKafkaProducer,
} from "./producer";

async function main() {
    const event = createTestEvent("TXNX-001");

    console.log("Publishing event:");
    console.log({
        eventId: event.eventId,
        eventType: event.eventType,
        userId: event.userId,
    });

    await publishEvent(event);

    console.log("Event published successfully.");
}

main()
    .catch((error) => {
        console.error("Producer test failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectKafkaProducer();
    });