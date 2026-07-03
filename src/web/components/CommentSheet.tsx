/**
 * CommentSheet — bottom sheet for viewing/editing a benefit's cycle comment,
 * with a "clear check state" affordance that restores the default
 * (automatic) used-state by sending `{ used: null }`.
 *
 * Presentational only: the parent owns the API calls and optimistic state.
 */
import { useEffect, useState } from "react";

export interface CommentSheetProps {
  open: boolean;
  itemName: string;
  comment: string | null;
  /** True when the current used-state is an explicit override (not default). */
  explicit: boolean;
  onSave: (comment: string | null) => void | Promise<void>;
  onClearCheckState: () => void | Promise<void>;
  onClose: () => void;
}

export default function CommentSheet({
  open,
  itemName,
  comment,
  explicit,
  onSave,
  onClearCheckState,
  onClose,
}: CommentSheetProps) {
  const [draft, setDraft] = useState(comment ?? "");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(comment ?? "");
      setError(null);
    }
  }, [open, comment]);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const trimmed = draft.trim();
      await onSave(trimmed.length > 0 ? trimmed : null);
      onClose();
    } catch {
      setError("Couldn't save the comment — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      await onClearCheckState();
      onClose();
    } catch {
      setError("Couldn't reset — try again.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-label={`Comment on ${itemName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <h2 className="sheet-title">{itemName}</h2>
        <textarea
          className="sheet-textarea"
          placeholder="Add a note (how you used it, when, etc.)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          autoFocus
        />
        {error && <p className="error-text">{error}</p>}
        <div className="sheet-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || clearing}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save comment"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={saving || clearing || !explicit}
            onClick={handleClear}
            title={
              explicit
                ? "Reset to the default checked state"
                : "Already at the default state"
            }
          >
            {clearing ? "Resetting…" : "Clear check state"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={saving || clearing}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
