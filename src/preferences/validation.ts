import { z } from "zod";

import { DIGEST_MODES, EVENT_CATEGORIES, type PreferenceInput } from "./types";

const preferenceInputSchema = z.object({
    eventCategory: z.enum(EVENT_CATEGORIES),
    eventType: z.string().min(1).max(50).default("*"),
    channel: z.enum(["SMS", "EMAIL", "PUSH", "WHATSAPP", "IN_APP"]),
    enabled: z.boolean().default(true),
    quietHoursOverride: z.boolean().default(false),
    digestMode: z.enum(DIGEST_MODES).default("immediate"),
    priorityOverride: z.number().int().min(1).max(5).nullable().default(null),
});

export const updatePreferencesSchema = z.object({
    preferences: z.array(preferenceInputSchema).min(1).max(125),
}).superRefine(({ preferences }, context) => {
    const seen = new Set<string>();

    preferences.forEach((preference, index) => {
        const key = [
            preference.eventCategory,
            preference.eventType,
            preference.channel,
        ].join(":");

        if (seen.has(key)) {
            context.addIssue({
                code: "custom",
                message: "Each event category, type, and channel combination must be unique",
                path: ["preferences", index],
            });
        }

        seen.add(key);
    });
});

export type UpdatePreferencesInput = {
    preferences: PreferenceInput[];
};
