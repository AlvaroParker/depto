export const DEFAULT_CURRENCY = "CLP";

export const SUPPORTED_CURRENCIES = [DEFAULT_CURRENCY] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
