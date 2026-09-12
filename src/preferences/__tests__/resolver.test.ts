import { describe, expect, it } from "vitest";

import {
    MissingChannelPolicyError,
    PreferenceHierarchyResolver,
    type PreferenceInput,
} from "../index";

const resolver = new PreferenceHierarchyResolver();

function resolve(preferences: PreferenceInput[] = []) {
    return resolver.resolve({
        eventType: "TXNX-004",
        eventCategory: "transaction",
        segment: "STANDARD",
        userPreferences: preferences,
    });
}

function preference(
    overrides: Partial<PreferenceInput> = {},
): PreferenceInput {
    return {
        eventCategory: "transaction",
        eventType: "*",
        channel: "EMAIL",
        enabled: true,
        quietHoursOverride: false,
        digestMode: "immediate",
        priorityOverride: null,
        ...overrides,
    };
}

describe("PreferenceHierarchyResolver", () => {
    it("starts with the system channel defaults", () => {
        expect(resolve()).toMatchObject([
            { channel: "EMAIL", source: "SYSTEM_DEFAULT", mandatory: false },
            { channel: "PUSH", source: "SYSTEM_DEFAULT", mandatory: false },
        ]);
    });

    it("adds segment-specific channels after system defaults", () => {
        const result = resolver.resolve({
            eventType: "TXNX-004",
            eventCategory: "transaction",
            segment: "PREMIUM",
            userPreferences: [],
        });

        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ channel: "WHATSAPP", source: "SEGMENT_OVERRIDE" }),
        ]));
    });

    it("lets a category preference disable a default channel", () => {
        expect(resolve([preference({ enabled: false })]).map(({ channel }) => channel))
            .not.toContain("EMAIL");
    });

    it("lets an event-specific preference override a category preference", () => {
        const result = resolve([
            preference({ enabled: false }),
            preference({ eventType: "TXNX-004", enabled: true, digestMode: "daily" }),
        ]);

        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({
                channel: "EMAIL",
                source: "USER_PREFERENCE",
                digestMode: "daily",
            }),
        ]));
    });

    it("allows an explicit user preference to add a channel", () => {
        const result = resolve([preference({ channel: "IN_APP" })]);

        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ channel: "IN_APP", source: "USER_PREFERENCE" }),
        ]));
    });

    it("preserves user quiet-hours and priority preferences", () => {
        const result = resolve([preference({
            quietHoursOverride: true,
            priorityOverride: 2,
        })]);

        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({
                quietHoursOverride: true,
                priorityOverride: 2,
            }),
        ]));
    });

    it("restores mandatory regulatory channels after a user disables them", () => {
        const result = resolver.resolve({
            eventType: "RISK-001",
            eventCategory: "risk_margin",
            segment: "STANDARD",
            userPreferences: [preference({
                eventCategory: "risk_margin",
                eventType: "RISK-001",
                channel: "SMS",
                enabled: false,
            })],
        });

        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({
                channel: "SMS",
                source: "REGULATORY_OVERRIDE",
                mandatory: true,
            }),
        ]));
    });

    it("fails clearly when an event has no system policy", () => {
        expect(() => resolver.resolve({
            eventType: "UNKNOWN-001",
            eventCategory: "transaction",
            segment: "STANDARD",
            userPreferences: [],
        })).toThrow(MissingChannelPolicyError);
    });
});
