import { createServer, type Server } from "node:http";

import {
    createPreferenceApiHandler,
    type PreferenceAnalytics,
    PreferenceService,
    type PreferenceCache,
    type PreferenceStore,
} from "../preferences";

/** Creates the ZeTheta HTTP server with the currently available API routes. */
export function createApiServer(
    store: PreferenceStore,
    preferenceCache?: PreferenceCache,
    preferenceAnalytics?: PreferenceAnalytics,
): Server {
    return createServer(createPreferenceApiHandler(
        new PreferenceService(store, preferenceCache, preferenceAnalytics),
    ));
}
