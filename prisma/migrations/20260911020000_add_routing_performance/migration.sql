ALTER TABLE "User"
ADD COLUMN "segment" TEXT NOT NULL DEFAULT 'STANDARD';

CREATE TABLE "UserChannelPerformance" (
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "deliveryRate" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "averageLatencyMs" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserChannelPerformance_pkey" PRIMARY KEY ("userId", "channel"),
    CONSTRAINT "UserChannelPerformance_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
