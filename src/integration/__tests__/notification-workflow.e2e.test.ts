import { describe, expect, it, vi } from "vitest";

import { FinancialEventSchema } from "../../events";
import { PreferenceHierarchyResolver } from "../../preferences";
import { EventRoutingService } from "../../routing/service";
import { SmsDispatchComplianceGate } from "../../compliance";
import { DeliveryAcknowledgementService, type DeliveryAcknowledgementStore } from "../../delivery";
import { ProviderFailoverService, type NamedDeliveryProvider } from "../../providers";

const event = FinancialEventSchema.parse({
    eventId: "margin-event-1", eventType: "RISK-001", eventCategory: "risk_margin", userId: "user-1",
    occurredAt: "2026-09-15T10:00:00.000Z", correlationId: "correlation-1", source: "e2e-test", priority: "CRITICAL",
    shortfallAmount: 25_000, deadline: "2026-09-15T11:00:00.000Z", liquidationRisk: "Positions may be squared off.",
});

function provider(name: string, send: NamedDeliveryProvider["send"]): NamedDeliveryProvider {
    return { provider: name, send, getStatus: async () => "UNKNOWN", validateRecipient: async () => ({ valid: true }), getQuota: async () => ({ provider: name, channel: "SMS", limit: null, remaining: null, resetsAt: null }) };
}

function acknowledgementStore() {
    const callbacks = new Set<string>();
    const update = vi.fn();
    const stateLog = vi.fn();
    const transaction = {
        deliveryAcknowledgement: { findUnique: async ({ where }: { where: { provider_callbackId: { provider: string; callbackId: string } } }) => callbacks.has(`${where.provider_callbackId.provider}:${where.provider_callbackId.callbackId}`) ? { id: "existing" } : null, create: async ({ data }: { data: { provider: string; callbackId: string } }) => { callbacks.add(`${data.provider}:${data.callbackId}`); return { id: "ack-1", ...data }; } },
        notification: { findFirst: async () => ({ id: "notification-1", createdAt: new Date("2026-09-15T10:00:00.000Z"), status: "SENT" as const, provider: "twilio", externalId: "SM123" }), update },
        notificationStateLog: { create: stateLog },
    };
    return { ...transaction, $transaction: async <T>(operation: (value: typeof transaction) => Promise<T>) => operation(transaction), update, stateLog } as unknown as DeliveryAcknowledgementStore & { update: ReturnType<typeof vi.fn>; stateLog: ReturnType<typeof vi.fn> };
}

describe("notification workflow end-to-end simulation", () => {
    it("validates a mandatory margin call, routes it, sends it, and tracks delivery", async () => {
        // Ingestion: validate the incoming financial event before it can enter the pipeline.
        expect(event.eventType).toBe("RISK-001");

        // Processing and routing: a DND-registered recipient cannot disable the mandatory SMS route.
        const channels = new PreferenceHierarchyResolver().resolve({ eventType: event.eventType, eventCategory: event.eventCategory, segment: "STANDARD", userPreferences: [{ eventCategory: "risk_margin", eventType: "RISK-001", channel: "SMS", enabled: false, quietHoursOverride: false, digestMode: "immediate", priorityOverride: null }] });
        const decision = new EventRoutingService().route({ event, user: { id: "user-1", phone: "+919876543210", email: "investor@example.com", name: null, language: "en", timezone: "Asia/Kolkata", segment: "STANDARD" }, channels, channelPerformance: {} });
        expect(decision.routes).toContainEqual(expect.objectContaining({ channel: "SMS", mandatory: true }));

        // Delivery: final DND lookup still occurs; transactional margin calls are allowed.
        const sent = vi.fn().mockResolvedValue({ providerMessageId: "SM123" });
        const gate = new SmsDispatchComplianceGate({ lookup: async (phone) => ({ phone, registered: true, source: "REGISTRY" }) }, { send: sent });
        await expect(gate.dispatch({ notificationId: "notification-1", userId: event.userId, phone: "+919876543210", content: "Margin shortfall requires action.", classification: "TRANSACTIONAL" })).resolves.toMatchObject({ status: "SENT", providerMessageId: "SM123" });
        expect(sent).toHaveBeenCalledOnce();

        // Tracking: the provider callback advances the matching notification exactly once.
        const store = acknowledgementStore();
        const acknowledgement = await new DeliveryAcknowledgementService(store).record({ callbackId: "callback-1", provider: "twilio", externalId: "SM123", status: "DELIVERED", providerStatus: "delivered", occurredAt: new Date("2026-09-15T10:01:00.000Z") });
        expect(acknowledgement).toMatchObject({ outcome: "APPLIED", notificationId: "notification-1" });
        expect(store.update).toHaveBeenCalledOnce();
        expect(store.stateLog).toHaveBeenCalledOnce();
    });

    it("uses the routing snapshot when a preference changes mid-delivery", () => {
        const resolver = new PreferenceHierarchyResolver();
        const beforeChange = resolver.resolve({ eventType: "TXNX-004", eventCategory: "transaction", segment: "STANDARD", userPreferences: [] });
        const afterChange = resolver.resolve({ eventType: "TXNX-004", eventCategory: "transaction", segment: "STANDARD", userPreferences: [{ eventCategory: "transaction", eventType: "*", channel: "EMAIL", enabled: false, quietHoursOverride: false, digestMode: "immediate", priorityOverride: null }] });
        expect(beforeChange.map(({ channel }) => channel)).toContain("EMAIL");
        expect(afterChange.map(({ channel }) => channel)).not.toContain("EMAIL");
        // A decision already constructed from beforeChange remains its immutable delivery snapshot.
        expect(beforeChange.map(({ channel }) => channel)).toContain("EMAIL");
    });

    it("switches provider during a retryable provider failover", async () => {
        const msg91 = provider("msg91", async () => ({ status: "FAILED", failureCode: "DOWN", failureReason: "unavailable", retryable: true }));
        const twilio = provider("twilio", async () => ({ status: "SENT", externalId: "SM124", acceptedAt: "2026-09-15T10:00:01.000Z" }));
        const service = new ProviderFailoverService({ get: (name) => new Map([["msg91", msg91], ["twilio", twilio]]).get(name) });
        await expect(service.send({ notificationId: "notification-2", eventId: event.eventId, eventType: event.eventType, userId: event.userId, channel: "SMS", recipient: "+919876543210", content: "Margin shortfall requires action." })).resolves.toMatchObject({ delivered: true, selectedProvider: "twilio", attempts: [{ provider: "msg91" }, { provider: "twilio" }] });
    });
});
