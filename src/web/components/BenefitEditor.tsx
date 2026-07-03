/**
 * BenefitEditor — structured editor for a single benefit (name, value,
 * frequency, anchor, automatic). Used by ParseReview (Phase D) AND by
 * CardForm's manual-entry mode (Phase C).
 * Owned by Phase D (implementation). Props below are the CONTRACT.
 */
import { useState } from "react";
import type { BenefitInput, Frequency, Anchor, Category } from "../../shared/types";
import { CATEGORY_META, CATEGORY_ORDER } from "../../shared/constants";

/** BenefitInput plus optional AI-confidence for highlight styling. */
export interface BenefitDraft extends BenefitInput {
  confidence?: "high" | "medium" | "low";
}

export interface BenefitEditorProps {
  value: BenefitDraft;
  onChange: (value: BenefitDraft) => void;
  /** When provided, a remove/delete affordance is shown. */
  onRemove?: () => void;
}

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
];

const ANCHOR_OPTIONS: { value: Anchor; label: string }[] = [
  { value: "calendar", label: "Calendar (resets Jan 1 / month start...)" },
  { value: "anniversary", label: "Card anniversary" },
];

/** cents → dollars string for display ("" when null/undefined). */
function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toString();
}

export default function BenefitEditor({
  value,
  onChange,
  onRemove,
}: BenefitEditorProps) {
  // Local string state for the dollars field so partial input ("12.", "") is
  // preserved while typing; the canonical valueCents lives on the draft.
  const [dollars, setDollars] = useState<string>(centsToDollars(value.valueCents));

  const patch = (changes: Partial<BenefitDraft>) =>
    onChange({ ...value, ...changes });

  const onDollarsChange = (raw: string) => {
    setDollars(raw);
    const trimmed = raw.trim();
    if (trimmed === "") {
      patch({ valueCents: null });
      return;
    }
    const num = Number(trimmed);
    if (Number.isFinite(num) && num >= 0) {
      patch({ valueCents: Math.round(num * 100) });
    }
  };

  const confidence = value.confidence;
  const showBadge = confidence === "medium" || confidence === "low";

  return (
    <div className={`benefit-editor${showBadge ? ` confidence-${confidence}` : ""}`}>
      {(showBadge || onRemove) && (
        <div className="benefit-editor-header">
          {showBadge ? (
            <span className={`confidence-badge confidence-${confidence}`}>
              {confidence} confidence — check this
            </span>
          ) : (
            <span />
          )}
          {onRemove && (
            <button
              type="button"
              className="btn-icon benefit-editor-remove"
              aria-label="Remove benefit"
              onClick={onRemove}
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className="field">
        <label>Name</label>
        <input
          type="text"
          value={value.name}
          placeholder="e.g. Uber Cash"
          onChange={(e) => patch({ name: e.target.value })}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Value (dollars)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={dollars}
            placeholder="optional"
            onChange={(e) => onDollarsChange(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Frequency</label>
          <select
            value={value.frequency}
            onChange={(e) => patch({ frequency: e.target.value as Frequency })}
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Resets on</label>
          <select
            value={value.anchor}
            onChange={(e) => patch({ anchor: e.target.value as Anchor })}
          >
            {ANCHOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Category</label>
          <select
            value={value.category}
            onChange={(e) => patch({ category: e.target.value as Category })}
          >
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field field-checkbox">
        <label>
          <input
            type="checkbox"
            checked={value.automatic}
            onChange={(e) => patch({ automatic: e.target.checked })}
          />
          <span>
            Automatic
            <span className="hint">posts automatically — auto-checked each cycle</span>
          </span>
        </label>
      </div>

      <div className="field">
        <label>Description</label>
        <textarea
          rows={2}
          value={value.description ?? ""}
          placeholder="optional"
          onChange={(e) =>
            patch({ description: e.target.value === "" ? null : e.target.value })
          }
        />
      </div>
    </div>
  );
}
