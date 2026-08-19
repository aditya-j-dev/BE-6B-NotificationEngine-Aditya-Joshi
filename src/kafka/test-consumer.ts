import {
    startConsumer,
    stopConsumer,
} from "./consumer";

async function main() {
    console.log("Starting notification consumer...");

    await startConsumer();
}

process.on("SIGINT", async () => {
    console.log("\nStopping consumer...");

    await stopConsumer();

    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("\nStopping consumer...");

    await stopConsumer();

    process.exit(0);
});

main().catch((error) => {
    console.error("Consumer failed:", error);
    process.exit(1);
});