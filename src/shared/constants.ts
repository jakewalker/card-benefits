import type { Category, Frequency } from "./types";

/** Single-user app: all cycle math happens in this fixed timezone. */
export const APP_TZ = "America/New_York";

/**
 * A benefit appears in "expiring soon" when it is not effectively used and
 * daysRemaining <= threshold for its frequency.
 */
export const WARN_THRESHOLD_DAYS: Record<Frequency, number> = {
  monthly: 7,
  quarterly: 14,
  semiannual: 30,
  annual: 30,
};

/** Annual-fee renewal warning window (days before anniversary). */
export const FEE_WARN_DAYS = 30;

/** Default number of past cycles returned by the history endpoint. */
export const DEFAULT_HISTORY_LIMIT = 12;

/** Display metadata for benefit categories, in canonical display order. */
export const CATEGORY_META: Record<Category, { label: string; icon: string }> = {
  dining: { label: "Dining", icon: "🍽️" },
  hotels: { label: "Hotels", icon: "🏨" },
  travel: { label: "Travel", icon: "✈️" },
  shopping: { label: "Shopping", icon: "🛍️" },
  entertainment: { label: "Entertainment", icon: "🎬" },
  other: { label: "Other", icon: "💳" },
};

export const CATEGORY_ORDER: Category[] = [
  "dining",
  "hotels",
  "travel",
  "shopping",
  "entertainment",
  "other",
];
