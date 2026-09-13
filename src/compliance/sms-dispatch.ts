import type { NotificationClassification } from "./classification";
import type { DndLookupResult } from "./dnd";

export interface SmsDispatchRequest {
    notificationId: string;
    userId: string;
    phone: string;
    content: string;
    classification: NotificationClassification;
}

export interface SmsProvider {
    send(request: SmsDispatchRequest): Promise<{ providerMessageId: string }>;
}

export interface DndLookup {
    lookup(phone: string): Promise<DndLookupResult>;
}

export type SmsDispatchResult =
    | {
        status: "SENT";
        providerMessageId: string;
        dndCheck: DndLookupResult;
    }
    | {
        status: "BLOCKED_DND";
        dndCheck: DndLookupResult;
    };

/**
 * The final compliance gate in an SMS path. No SMS provider is invoked until
 * this method has completed a fresh DND lookup for the target phone number.
 */
export class SmsDispatchComplianceGate {
    constructor(
        private readonly dndLookup: DndLookup,
        private readonly provider: SmsProvider,
    ) { }

    async dispatch(request: SmsDispatchRequest): Promise<SmsDispatchResult> {
        // This must remain the final asynchronous check before provider.send.
        const dndCheck = await this.dndLookup.lookup(request.phone);

        if (
            request.classification === "PROMOTIONAL" &&
            dndCheck.registered
        ) {
            return { status: "BLOCKED_DND", dndCheck };
        }

        const providerResult = await this.provider.send(request);

        return {
            status: "SENT",
            providerMessageId: providerResult.providerMessageId,
            dndCheck,
        };
    }
}
