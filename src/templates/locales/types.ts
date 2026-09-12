import type { FinancialEvent } from "../../events/types";

export type EventTemplateCopy = Record<FinancialEvent["eventType"], string>;
