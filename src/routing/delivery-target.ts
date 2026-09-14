import type { NotificationChannel } from "../generated/prisma/enums";
import type { RoutingDecision } from "./types";

/** Resolves a channel address from an explicit override or safe user-profile default. */
export function resolveDeliveryRecipient(
    channel: NotificationChannel,
    decision: RoutingDecision,
    recipients: Partial<Record<NotificationChannel, string>> | undefined,
): string | undefined {
    const override = recipients?.[channel];
    if (override) return override;

    switch (channel) {
        case "SMS":
        case "WHATSAPP":
            return decision.enrichedEvent.user.phone;
        case "EMAIL":
            return decision.enrichedEvent.user.email;
        case "IN_APP":
            return decision.enrichedEvent.user.id;
        case "PUSH":
            // FCM tokens belong to devices, not the user profile; callers supply them.
            return undefined;
    }
}
