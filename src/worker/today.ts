/**
 * "Today" resolution shared by the dashboard, benefit-history, and usage
 * routes (Phase B). Not part of the original file tree, but explicitly
 * sanctioned by the plan as a small worker-local helper.
 *
 * Behavior:
 * - In dev (`import.meta.env.DEV`), an `X-Debug-Today` header (validated as
 *   `YYYY-MM-DD`) overrides "today" so expiration windows can be exercised
 *   without waiting for real time to pass.
 * - Otherwise (and always in production), falls back to
 *   `todayInAppTz()` from `src/shared/dates.ts`.
 */
import type { Context } from "hono";
import type { AppEnv } from "./index";
import { isoDateSchema, type ISODate } from "../shared/types";
import { todayInAppTz } from "../shared/dates";

export function resolveToday(c: Context<AppEnv>): ISODate {
  if (import.meta.env.DEV) {
    const header = c.req.header("X-Debug-Today");
    if (header) {
      const parsed = isoDateSchema.safeParse(header);
      if (parsed.success) {
        return parsed.data;
      }
    }
  }
  return todayInAppTz();
}
