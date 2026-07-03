/**
 * BenefitEditor — structured editor for a single benefit (name, value,
 * frequency, anchor, automatic). Used by ParseReview (Phase D) AND by
 * CardForm's manual-entry mode (Phase C).
 * Owned by Phase D (implementation). Props below are the CONTRACT.
 */
import type { BenefitInput } from "../../shared/types";

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

export default function BenefitEditor(_props: BenefitEditorProps) {
  // TODO(Phase D): implement per contract above.
  return <div>BenefitEditor unimplemented (Phase D)</div>;
}
