/**
 * ParseReview — editable review form for an AI-parsed card+benefits payload.
 * Owned by Phase D (implementation). The props below are the CONTRACT that
 * Phase C's CardForm imports against — do not change them.
 *
 * Behavior (Phase D):
 * - Renders card fields + one BenefitEditor row per parsed benefit.
 * - Low/medium-confidence rows visually highlighted.
 * - anniversary_date is usually null from the model → required before import.
 * - Rows can be edited/removed; benefits can be added.
 * - "Import" converts edited state to ImportPayload (camelCase) and calls
 *   onImport; surface its rejection as an inline error.
 */
import { useState } from "react";
import type {
  ImportPayload,
  ParsedCardPayload,
} from "../../shared/types";
import { importPayloadSchema } from "../../shared/types";
import BenefitEditor, { type BenefitDraft } from "./BenefitEditor";

export interface ParseReviewProps {
  initial: ParsedCardPayload;
  onImport: (payload: ImportPayload) => Promise<void>;
  onCancel: () => void;
}

function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toString();
}

/** Convert a snake_case parsed benefit into a camelCase editor draft. */
function toDraft(b: ParsedCardPayload["benefits"][number]): BenefitDraft {
  return {
    name: b.name,
    description: b.description,
    valueCents: b.value_cents,
    frequency: b.frequency,
    anchor: b.anchor,
    automatic: b.automatic,
    confidence: b.confidence,
  };
}

function emptyDraft(): BenefitDraft {
  return {
    name: "",
    description: null,
    valueCents: null,
    frequency: "annual",
    anchor: "anniversary",
    automatic: false,
  };
}

export default function ParseReview({
  initial,
  onImport,
  onCancel,
}: ParseReviewProps) {
  const [name, setName] = useState(initial.card.name);
  const [issuer, setIssuer] = useState(initial.card.issuer ?? "");
  const [feeDollars, setFeeDollars] = useState(
    centsToDollars(initial.card.annual_fee_cents),
  );
  const [anniversaryDate, setAnniversaryDate] = useState(
    initial.card.anniversary_date ?? "",
  );
  const [benefits, setBenefits] = useState<BenefitDraft[]>(
    initial.benefits.map(toDraft),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateBenefit = (i: number, next: BenefitDraft) =>
    setBenefits((prev) => prev.map((b, idx) => (idx === i ? next : b)));

  const removeBenefit = (i: number) =>
    setBenefits((prev) => prev.filter((_, idx) => idx !== i));

  const addBenefit = () => setBenefits((prev) => [...prev, emptyDraft()]);

  const canImport =
    name.trim() !== "" &&
    anniversaryDate !== "" &&
    benefits.every(
      (b) => b.name.trim() !== "" && !!b.frequency && !!b.anchor,
    );

  const buildPayload = (): ImportPayload => {
    const feeTrimmed = feeDollars.trim();
    const feeNum = feeTrimmed === "" ? 0 : Number(feeTrimmed);
    const annualFeeCents =
      Number.isFinite(feeNum) && feeNum >= 0 ? Math.round(feeNum * 100) : 0;

    return {
      card: {
        name: name.trim(),
        issuer: issuer.trim() === "" ? null : issuer.trim(),
        annualFeeCents,
        anniversaryDate,
      },
      benefits: benefits.map((b) => ({
        name: b.name.trim(),
        description:
          b.description == null || b.description === "" ? null : b.description,
        valueCents: b.valueCents ?? null,
        frequency: b.frequency,
        anchor: b.anchor,
        automatic: b.automatic,
      })),
    };
  };

  const handleImport = async () => {
    setError(null);
    const parsed = importPayloadSchema.safeParse(buildPayload());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid data");
      return;
    }
    setSubmitting(true);
    try {
      await onImport(parsed.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="parse-review">
      {initial.notes && (
        <div className="info-box parse-notes">
          <span className="info-box-label">From the AI parse</span>
          {initial.notes}
        </div>
      )}

      <h3 className="form-section-title">Card</h3>
      <section className="card-fields">
        <div className="field">
          <label>Card name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Issuer</label>
          <input
            type="text"
            value={issuer}
            placeholder="optional"
            onChange={(e) => setIssuer(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Annual fee (dollars)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={feeDollars}
            placeholder="0"
            onChange={(e) => setFeeDollars(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Anniversary date</label>
          <input
            type="date"
            value={anniversaryDate}
            onChange={(e) => setAnniversaryDate(e.target.value)}
          />
          <span className="hint">
            when did you open / when does the fee post?
          </span>
        </div>
      </section>

      <h3 className="form-section-title">
        Benefits
        {benefits.length > 0 && (
          <span className="form-section-count">{benefits.length}</span>
        )}
      </h3>
      <section className="benefits-list">
        {benefits.map((b, i) => (
          <BenefitEditor
            key={i}
            value={b}
            onChange={(next) => updateBenefit(i, next)}
            onRemove={() => removeBenefit(i)}
          />
        ))}
        <button type="button" className="btn btn-add" onClick={addBenefit}>
          Add benefit
        </button>
      </section>

      {error && <div className="error-box parse-error">{error}</div>}

      <div className="parse-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canImport || submitting}
          onClick={handleImport}
        >
          {submitting ? "Importing…" : "Import"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
