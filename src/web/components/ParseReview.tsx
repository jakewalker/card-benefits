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
import type { ImportPayload, ParsedCardPayload } from "../../shared/types";

export interface ParseReviewProps {
  initial: ParsedCardPayload;
  onImport: (payload: ImportPayload) => Promise<void>;
  onCancel: () => void;
}

export default function ParseReview(_props: ParseReviewProps) {
  // TODO(Phase D): implement per contract above.
  return <div>ParseReview unimplemented (Phase D)</div>;
}
