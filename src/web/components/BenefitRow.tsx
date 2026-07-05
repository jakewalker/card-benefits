/**
 * BenefitRow — a single row for a benefit or a synthesized annual-fee item.
 * Used on the Dashboard (expiring soon / this cycle) and on CardDetail.
 *
 * Also exports small formatting helpers (`formatCents`, `formatDate`) reused
 * across pages/components, since src/shared is frozen and off-limits here.
 */
import { useRef } from "react";
import type { Category, ISODate } from "../../shared/types";
import { addDays } from "../../shared/dates";
import { CATEGORY_META } from "../../shared/constants";

export function formatCents(cents: number | null): string {
  if (cents == null) return "";
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  });
}

/** Formats an ISO 'YYYY-MM-DD' date for display, avoiding UTC-shift bugs. */
export function formatDate(iso: ISODate): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysLeftLabel(daysRemaining: number): string {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining === 0) return "last day";
  return `${daysRemaining}d left`;
}

function pillClass(daysRemaining: number): string {
  if (daysRemaining <= 3) return "pill pill-red";
  if (daysRemaining <= 7) return "pill pill-amber";
  return "pill pill-neutral";
}

export interface BenefitRowProps {
  name: string;
  /** Shown as a small subtitle; omit when already grouped/scoped by card. */
  cardName?: string;
  kind?: "benefit" | "annual_fee";
  valueCents: number | null;
  /** When provided, a small category chip is shown ('other' is omitted as noise). */
  category?: Category;
  daysRemaining: number;
  effectiveUsed: boolean;
  explicit: boolean;
  automatic: boolean;
  comment: string | null;
  /**
   * Required when kind === 'annual_fee': the LAST day of the current fee
   * window (i.e. `window.end`). The rendered renewal date is one day after.
   */
  windowEnd?: ISODate;
  /** Present => checkbox is rendered; absent => no checkbox (annual_fee rows). */
  onToggle?: () => void;
  /** Present => ellipsis button is rendered to open the comment sheet. */
  onOpenComment?: () => void;
  busy?: boolean;
}

export default function BenefitRow({
  name,
  cardName,
  kind = "benefit",
  valueCents,
  category,
  daysRemaining,
  effectiveUsed,
  automatic,
  comment,
  windowEnd,
  onToggle,
  onOpenComment,
  busy = false,
}: BenefitRowProps) {
  const pressTimer = useRef<number | null>(null);

  function startPress() {
    if (!onOpenComment) return;
    pressTimer.current = window.setTimeout(() => {
      onOpenComment();
      pressTimer.current = null;
    }, 500);
  }
  function cancelPress() {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  if (kind === "annual_fee") {
    return (
      <div className="benefit-row benefit-row-fee">
        <div className="benefit-row-main">
          <p className="benefit-row-name">
            {formatCents(valueCents)} annual fee renews{" "}
            {windowEnd ? formatDate(addDays(windowEnd, 1)) : "soon"}
          </p>
          {cardName && <p className="benefit-row-subtitle">{cardName}</p>}
        </div>
        <span className={pillClass(daysRemaining)}>{daysLeftLabel(daysRemaining)}</span>
      </div>
    );
  }

  return (
    <div
      className={`benefit-row${busy ? " benefit-row-busy" : ""}`}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onContextMenu={(e) => {
        if (!onOpenComment) return;
        e.preventDefault();
        onOpenComment();
      }}
    >
      {onToggle ? (
        <label className="benefit-row-check">
          <input
            type="checkbox"
            checked={effectiveUsed}
            disabled={busy}
            onChange={onToggle}
            aria-label={`Mark ${name} as ${effectiveUsed ? "not used" : "used"}`}
          />
        </label>
      ) : (
        <span className="benefit-row-check benefit-row-check-spacer" aria-hidden />
      )}

      <div className="benefit-row-main">
        <p className="benefit-row-name">
          {name}
          {category && category !== "other" && (
            <span
              className="badge badge-category"
              title={CATEGORY_META[category].label}
            >
              {CATEGORY_META[category].icon} {CATEGORY_META[category].label}
            </span>
          )}
          {automatic && <span className="badge badge-auto">auto</span>}
          {comment && (
            <span className="badge badge-comment" title={comment}>
              note
            </span>
          )}
        </p>
        {cardName && <p className="benefit-row-subtitle">{cardName}</p>}
        {valueCents != null && (
          <p className="benefit-row-value">{formatCents(valueCents)}</p>
        )}
      </div>

      <span className={pillClass(daysRemaining)}>{daysLeftLabel(daysRemaining)}</span>

      {onOpenComment && (
        <button
          type="button"
          className="btn-icon"
          aria-label={`Comment on ${name}`}
          onClick={onOpenComment}
        >
          &#8942;
        </button>
      )}
    </div>
  );
}
