# Build stage: development dependencies are needed only to generate and compile TypeScript.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY vitest.config.mts ./
COPY schemas ./schemas
COPY src ./src
RUN npx prisma generate && npm run build

# Production stage: no compiler, tests, or development dependencies are shipped.
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/schemas ./schemas
USER node
CMD ["node", "dist/kafka/test-consumer.js"]
