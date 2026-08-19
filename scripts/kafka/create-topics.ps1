$ErrorActionPreference = "Stop"

$KafkaContainer = "notification-kafka"
$BootstrapServer = "kafka:29092"

Write-Host "Checking Kafka broker..."

docker exec $KafkaContainer kafka-broker-api-versions `
    --bootstrap-server $BootstrapServer | Out-Null

Write-Host "Kafka broker is ready."

Write-Host "Creating notification-events..."

docker exec $KafkaContainer kafka-topics `
    --bootstrap-server $BootstrapServer `
    --create `
    --if-not-exists `
    --topic notification-events `
    --partitions 6 `
    --replication-factor 1

Write-Host "Creating notification-critical..."

docker exec $KafkaContainer kafka-topics `
    --bootstrap-server $BootstrapServer `
    --create `
    --if-not-exists `
    --topic notification-critical `
    --partitions 3 `
    --replication-factor 1

Write-Host "Creating notification-dlq..."

docker exec $KafkaContainer kafka-topics `
    --bootstrap-server $BootstrapServer `
    --create `
    --if-not-exists `
    --topic notification-dlq `
    --partitions 3 `
    --replication-factor 1

Write-Host ""
Write-Host "Kafka topics configured successfully."
Write-Host ""

docker exec $KafkaContainer kafka-topics `
    --bootstrap-server $BootstrapServer `
    --list

Write-Host ""
Write-Host "Topic details:"
Write-Host ""

docker exec $KafkaContainer kafka-topics `
    --bootstrap-server $BootstrapServer `
    --describe `
    --topic notification-events

docker exec $KafkaContainer kafka-topics `
    --bootstrap-server $BootstrapServer `
    --describe `
    --topic notification-critical

docker exec $KafkaContainer kafka-topics `
    --bootstrap-server $BootstrapServer `
    --describe `
    --topic notification-dlq