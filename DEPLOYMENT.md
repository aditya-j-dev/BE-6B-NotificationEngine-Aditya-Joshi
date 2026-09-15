# Production deployment checklist

## Before deployment

- [ ] Use Node.js 22 and Docker Engine/Compose versions supported by the project.
- [ ] Create production PostgreSQL, Redis, Kafka, and RabbitMQ services with backups and monitoring.
- [ ] Create deployment secrets outside the repository: database URL, broker URLs, provider credentials, SMTP credentials, and alert-recipient configuration.
- [ ] Set unique `POSTGRES_PASSWORD` and `RABBITMQ_PASSWORD`; never use example values.
- [ ] Use managed secret storage or the deployment platform's encrypted secrets.
- [ ] Review `npm audit` results and approve any dependency upgrade plan.

## Build and release

```powershell
npm ci
npm run lint
npm test
npm run build
docker compose build worker
```

Confirm the image is below the 200 MB project target:

```powershell
docker compose images
```

## Database migration

- [ ] Back up the production database.
- [ ] Review the pending migration SQL.
- [ ] Run `npx prisma migrate deploy` with the production `DATABASE_URL`.
- [ ] Confirm migration status before starting new workers.

Never use `prisma migrate reset` in production.

## Rollout

```powershell
docker compose up -d --build
docker compose ps
```

- [ ] Ensure PostgreSQL, Redis, Kafka, RabbitMQ, and worker containers report healthy.
- [ ] Confirm the worker joins its Kafka consumer group.
- [ ] Exercise `/health`, `/openapi.json`, and `/api-docs` from the deployed API host.
- [ ] Send a controlled notification through each configured provider.
- [ ] Confirm delivery acknowledgements, metrics, retry behaviour, and DLQ alerts.

## Rollback

- [ ] Stop the new worker deployment without deleting persistent volumes.
- [ ] Deploy the previous known-good image.
- [ ] Do not roll back an applied database migration unless a reviewed reverse migration exists.
- [ ] Preserve Kafka, PostgreSQL, Redis, RabbitMQ, and DLQ evidence for investigation.

## Operations after release

- [ ] Monitor provider failures, circuit breakers, delivery latency, DLQ depth, DND violations, and opt-out rate.
- [ ] Rotate provider and database credentials on the organisation's schedule.
- [ ] Regularly restore-test PostgreSQL and broker backups.
- [ ] Replace the in-memory API limiter with a Redis-backed limiter before horizontally scaling API processes.
