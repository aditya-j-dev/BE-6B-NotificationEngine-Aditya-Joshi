# Day 14 security hardening

## API protection

Every public API route passes through the in-memory fixed-window rate limiter. Defaults are 120 requests per client address per 60 seconds. Override only when required with `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`. A distributed deployment must replace this in-memory limiter with a shared Redis-backed implementation before adding more than one API process.

Request bodies are parsed as JSON and validated using Zod schemas at each mutable endpoint. A gateway validation layer rejects malformed, control-character-bearing, or oversized request targets before route matching, and baseline browser security headers are applied to every response. Path segments are decoded by the route handlers rather than interpolated into database queries. Database reads and writes use Prisma Client's typed query APIs; this codebase does not use `queryRawUnsafe` or `executeRawUnsafe` outside generated Prisma source.

## Automated checks

The GitHub Actions workflow runs linting, tests, a build, an 80% coverage gate, `npm audit --audit-level=high`, and Gitleaks history scanning. Do not place real credentials in source, documentation, tests, Docker files, or the Postman collection. Use `.env` locally and repository/environment secrets in hosted deployments.

## Container safeguards

The production image is multi-stage, runs as the unprivileged `node` user, and excludes development dependencies. Compose secrets are read from environment variables rather than committed files.
