import { NotificationChannel } from "../generated/prisma/enums";

interface EventChannelPolicy {
    defaultChannels: NotificationChannel[];
    regulatoryChannels: NotificationChannel[];
}

const SMS = "SMS" as NotificationChannel;
const EMAIL = "EMAIL" as NotificationChannel;
const PUSH = "PUSH" as NotificationChannel;
const WHATSAPP = "WHATSAPP" as NotificationChannel;
const IN_APP = "IN_APP" as NotificationChannel;

export const EVENT_CHANNEL_POLICY: Record<
    string,
    EventChannelPolicy
> = {
    // Transaction
    "TXNX-001": {
        defaultChannels: [SMS, PUSH, EMAIL],
        regulatoryChannels: [SMS, PUSH, EMAIL],
    },

    "TXNX-002": {
        defaultChannels: [SMS, PUSH, EMAIL],
        regulatoryChannels: [SMS, PUSH, EMAIL],
    },

    "TXNX-003": {
        defaultChannels: [PUSH, SMS],
        regulatoryChannels: [PUSH, SMS],
    },

    "TXNX-004": {
        defaultChannels: [EMAIL, PUSH],
        regulatoryChannels: [],
    },

    "TXNX-005": {
        defaultChannels: [SMS, PUSH],
        regulatoryChannels: [SMS, PUSH],
    },

    // Risk & Margin
    "RISK-001": {
        defaultChannels: [SMS, PUSH],
        regulatoryChannels: [SMS, PUSH],
    },

    "RISK-002": {
        defaultChannels: [SMS, PUSH, EMAIL],
        regulatoryChannels: [SMS, PUSH, EMAIL],
    },

    "RISK-003": {
        defaultChannels: [SMS, PUSH, EMAIL],
        regulatoryChannels: [SMS, PUSH, EMAIL],
    },

    "RISK-004": {
        defaultChannels: [PUSH, EMAIL],
        regulatoryChannels: [],
    },

    "RISK-005": {
        defaultChannels: [EMAIL, IN_APP],
        regulatoryChannels: [],
    },

    // SIP & Investment
    "SIPX-001": {
        defaultChannels: [PUSH, WHATSAPP],
        regulatoryChannels: [],
    },

    "SIPX-002": {
        defaultChannels: [SMS, EMAIL],
        regulatoryChannels: [SMS, EMAIL],
    },

    "SIPX-003": {
        defaultChannels: [SMS, PUSH, EMAIL],
        regulatoryChannels: [SMS, PUSH, EMAIL],
    },

    "SIPX-004": {
        defaultChannels: [EMAIL, IN_APP],
        regulatoryChannels: [],
    },

    "SIPX-005": {
        defaultChannels: [PUSH, IN_APP],
        regulatoryChannels: [],
    },

    // Market & Price
    "MKTX-001": {
        defaultChannels: [PUSH, SMS],
        regulatoryChannels: [],
    },

    "MKTX-002": {
        defaultChannels: [PUSH, SMS],
        regulatoryChannels: [PUSH, SMS],
    },

    "MKTX-003": {
        defaultChannels: [PUSH],
        regulatoryChannels: [],
    },

    "MKTX-004": {
        defaultChannels: [PUSH, EMAIL],
        regulatoryChannels: [],
    },

    "MKTX-005": {
        defaultChannels: [EMAIL, IN_APP],
        regulatoryChannels: [],
    },

    // Regulatory & Compliance
    "REGX-001": {
        defaultChannels: [SMS, EMAIL, PUSH],
        regulatoryChannels: [SMS, EMAIL, PUSH],
    },

    "REGX-002": {
        defaultChannels: [EMAIL, PUSH],
        regulatoryChannels: [EMAIL, PUSH],
    },

    "REGX-003": {
        defaultChannels: [EMAIL],
        regulatoryChannels: [EMAIL],
    },

    "REGX-004": {
        defaultChannels: [EMAIL, IN_APP],
        regulatoryChannels: [EMAIL, IN_APP],
    },

    "REGX-005": {
        defaultChannels: [EMAIL],
        regulatoryChannels: [],
    },
};