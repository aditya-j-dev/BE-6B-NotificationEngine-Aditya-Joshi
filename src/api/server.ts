import { createServer, type Server } from "node:http";

import {
    createPreferenceApiHandler,
    type PreferenceAnalytics,
    PreferenceService,
    type PreferenceCache,
    type PreferenceStore,
} from "../preferences";
import {
    createDeliveryAcknowledgementApiHandler,
    DeliveryAcknowledgementService,
} from "../delivery";

/** Creates the ZeTheta HTTP server with the currently available API routes. */
export function createApiServer(
    store: PreferenceStore,
    preferenceCache?: PreferenceCache,
    preferenceAnalytics?: PreferenceAnalytics,
    deliveryAcknowledgements?: DeliveryAcknowledgementService,
): Server {
    const preferenceHandler = createPreferenceApiHandler(
        new PreferenceService(store, preferenceCache, preferenceAnalytics),
    );
    const acknowledgementHandler = deliveryAcknowledgements
        ? createDeliveryAcknowledgementApiHandler(deliveryAcknowledgements)
        : undefined;

    return createServer((request, response) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (pathname === "/provider-callbacks" && acknowledgementHandler) {
            return acknowledgementHandler(request, response);
        }

        return preferenceHandler(request, response);
    });
}
