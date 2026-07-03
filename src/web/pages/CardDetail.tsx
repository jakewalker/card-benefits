/**
 * CardDetail — card header (close/reopen), benefit rows with tap-to-check,
 * expandable per-benefit history, inline edit/deactivate, and an "add
 * benefit" form using the (Phase D) BenefitEditor.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api";
import type {
  BenefitInput,
  BenefitWithStatus,
  CardDetailPayload,
} from "../../shared/types";
import BenefitRow, { formatCents, formatDate } from "../components/BenefitRow";
import CommentSheet from "../components/CommentSheet";
import HistoryList from "../components/HistoryList";
import BenefitEditor, { type BenefitDraft } from "../components/BenefitEditor";

const BLANK_DRAFT: BenefitDraft = {
  name: "",
  description: null,
  valueCents: null,
  frequency: "monthly",
  anchor: "calendar",
  automatic: false,
};

function stripConfidence(draft: BenefitDraft): BenefitInput {
  const { confidence: _confidence, ...rest } = draft;
  return rest;
}

function draftFromBenefit(b: BenefitWithStatus): BenefitDraft {
  return {
    name: b.name,
    description: b.description,
    valueCents: b.valueCents,
    frequency: b.frequency,
    anchor: b.anchor,
    automatic: b.automatic,
    startDate: b.startDate,
  };
}

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payload, setPayload] = useState<CardDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<BenefitWithStatus | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BenefitDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deactivateBusyId, setDeactivateBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<BenefitDraft>(BLANK_DRAFT);
  const [addError, setAddError] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    const data = await api.getCard(id);
    setPayload(data);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getCard(id)
      .then((data) => {
        if (alive) setPayload(data);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiClientError ? err.body.error : "Couldn't load this card.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  async function handleCloseReopen() {
    if (!payload || !id) return;
    setStatusBusy(true);
    setBanner(null);
    try {
      const card =
        payload.card.status === "active"
          ? await api.closeCard(id)
          : await api.reopenCard(id);
      setPayload({ ...payload, card });
    } catch {
      setBanner("Couldn't update the card's status — try again.");
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleToggle(benefit: BenefitWithStatus) {
    if (!payload) return;
    const nextUsed = !benefit.status.effectiveUsed;
    const previous = payload;
    setToggleBusyId(benefit.id);
    setBanner(null);
    setPayload({
      ...payload,
      benefits: payload.benefits.map((b) =>
        b.id === benefit.id
          ? { ...b, status: { ...b.status, effectiveUsed: nextUsed, explicit: true } }
          : b,
      ),
    });
    try {
      await api.setUsage(benefit.id, benefit.status.window.key, { used: nextUsed });
    } catch {
      setPayload(previous);
      setBanner("Couldn't update — try again.");
    } finally {
      setToggleBusyId(null);
    }
  }

  async function handleSaveComment(comment: string | null) {
    if (!payload || !commentTarget) return;
    const previous = payload;
    setPayload({
      ...payload,
      benefits: payload.benefits.map((b) =>
        b.id === commentTarget.id ? { ...b, status: { ...b.status, comment } } : b,
      ),
    });
    try {
      await api.setUsage(commentTarget.id, commentTarget.status.window.key, { comment });
    } catch {
      setPayload(previous);
      throw new Error("save failed");
    }
  }

  async function handleClearCheckState() {
    if (!payload || !commentTarget) return;
    const previous = payload;
    setPayload({
      ...payload,
      benefits: payload.benefits.map((b) =>
        b.id === commentTarget.id
          ? { ...b, status: { ...b.status, effectiveUsed: b.automatic, explicit: false } }
          : b,
      ),
    });
    try {
      await api.setUsage(commentTarget.id, commentTarget.status.window.key, { used: null });
    } catch {
      setPayload(previous);
      throw new Error("reset failed");
    }
  }

  function startEdit(benefit: BenefitWithStatus) {
    setEditingId(benefit.id);
    setEditDraft(draftFromBenefit(benefit));
    setEditError(null);
  }

  async function handleSaveEdit(benefitId: string, force = false) {
    if (!editDraft) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.updateBenefit(benefitId, stripConfidence(editDraft), { force });
      setEditingId(null);
      setEditDraft(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.body.code === "frequency_change_conflict") {
        const confirmed = window.confirm(
          "Changing the frequency or anchor conflicts with this benefit's usage history. Save anyway?",
        );
        if (confirmed) {
          await handleSaveEdit(benefitId, true);
          return;
        }
      } else {
        setEditError(err instanceof ApiClientError ? err.body.error : "Couldn't save changes.");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeactivateReactivate(benefit: BenefitWithStatus) {
    setDeactivateBusyId(benefit.id);
    setBanner(null);
    try {
      if (benefit.active) {
        await api.deactivateBenefit(benefit.id);
      } else {
        await api.reactivateBenefit(benefit.id);
      }
      await refresh();
    } catch {
      setBanner("Couldn't update the benefit — try again.");
    } finally {
      setDeactivateBusyId(null);
    }
  }

  async function handleAddBenefit() {
    if (!id) return;
    setSavingNew(true);
    setAddError(null);
    try {
      await api.addBenefit(id, stripConfidence(newDraft));
      setNewDraft(BLANK_DRAFT);
      setAdding(false);
      await refresh();
    } catch (err) {
      setAddError(err instanceof ApiClientError ? err.body.error : "Couldn't add the benefit.");
    } finally {
      setSavingNew(false);
    }
  }

  if (loading) {
    return <p className="state-message">Loading card…</p>;
  }
  if (error || !payload) {
    return <p className="state-message state-message-error">{error ?? "Card not found."}</p>;
  }

  const { card, benefits } = payload;
  const activeBenefits = benefits.filter((b) => b.active);
  const inactiveBenefits = benefits.filter((b) => !b.active);

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">{card.name}</h1>
          {card.issuer && <p className="benefit-row-subtitle">{card.issuer}</p>}
        </div>
        <Link to={`/cards/${card.id}/edit`} className="btn btn-secondary btn-sm">
          Edit
        </Link>
      </div>

      <div className="card">
        <p className="benefit-row-subtitle">
          {formatCents(card.annualFeeCents)} annual fee · anniversary{" "}
          {formatDate(card.anniversaryDate)}
        </p>
        <p className="benefit-row-subtitle">
          Status: {card.status}
          {card.status === "closed" && card.closedAt ? ` (${formatDate(card.closedAt.slice(0, 10))})` : ""}
        </p>
        <button
          type="button"
          className={card.status === "active" ? "btn btn-danger btn-sm" : "btn btn-secondary btn-sm"}
          disabled={statusBusy}
          onClick={handleCloseReopen}
        >
          {statusBusy
            ? "Working…"
            : card.status === "active"
              ? "Close card"
              : "Reopen card"}
        </button>
      </div>

      {banner && <p className="banner banner-error">{banner}</p>}

      <section className="section">
        <h2 className="section-title">Benefits</h2>
        {activeBenefits.length === 0 && (
          <p className="state-message state-message-inline">No benefits yet — add one below.</p>
        )}
        <div className="card-list">
          {activeBenefits.map((benefit) => (
            <div key={benefit.id} className="benefit-block">
              <BenefitRow
                name={benefit.name}
                kind="benefit"
                valueCents={benefit.valueCents}
                daysRemaining={benefit.status.daysRemaining}
                effectiveUsed={benefit.status.effectiveUsed}
                explicit={benefit.status.explicit}
                automatic={benefit.automatic}
                comment={benefit.status.comment}
                busy={toggleBusyId === benefit.id}
                onToggle={() => handleToggle(benefit)}
                onOpenComment={() => setCommentTarget(benefit)}
              />
              <div className="benefit-block-actions">
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setExpandedId(expandedId === benefit.id ? null : benefit.id)}
                >
                  {expandedId === benefit.id ? "Hide history" : "History"}
                </button>
                <button type="button" className="btn-link" onClick={() => startEdit(benefit)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-link btn-link-danger"
                  disabled={deactivateBusyId === benefit.id}
                  onClick={() => handleDeactivateReactivate(benefit)}
                >
                  {deactivateBusyId === benefit.id ? "Working…" : "Deactivate"}
                </button>
              </div>

              {expandedId === benefit.id && (
                <div className="benefit-block-expanded">
                  <HistoryList benefitId={benefit.id} />
                </div>
              )}

              {editingId === benefit.id && editDraft && (
                <div className="benefit-block-expanded">
                  <BenefitEditor value={editDraft} onChange={setEditDraft} />
                  {editError && <p className="error-text">{editError}</p>}
                  <div className="sheet-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={savingEdit}
                      onClick={() => handleSaveEdit(benefit.id)}
                    >
                      {savingEdit ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={savingEdit}
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {inactiveBenefits.length > 0 && (
        <section className="section">
          <h2 className="section-title">Inactive</h2>
          <div className="card-list">
            {inactiveBenefits.map((benefit) => (
              <div key={benefit.id} className="benefit-block benefit-block-inactive">
                <p className="benefit-row-name">{benefit.name}</p>
                <button
                  type="button"
                  className="btn-link"
                  disabled={deactivateBusyId === benefit.id}
                  onClick={() => handleDeactivateReactivate(benefit)}
                >
                  {deactivateBusyId === benefit.id ? "Working…" : "Reactivate"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        {adding ? (
          <div className="benefit-block-expanded">
            <BenefitEditor value={newDraft} onChange={setNewDraft} />
            {addError && <p className="error-text">{addError}</p>}
            <div className="sheet-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={savingNew}
                onClick={handleAddBenefit}
              >
                {savingNew ? "Adding…" : "Add benefit"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={savingNew}
                onClick={() => {
                  setAdding(false);
                  setNewDraft(BLANK_DRAFT);
                  setAddError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            Add benefit
          </button>
        )}
      </section>

      <CommentSheet
        open={commentTarget != null}
        itemName={commentTarget?.name ?? ""}
        comment={commentTarget?.status.comment ?? null}
        explicit={commentTarget?.status.explicit ?? false}
        onSave={handleSaveComment}
        onClearCheckState={handleClearCheckState}
        onClose={() => setCommentTarget(null)}
      />

      <button type="button" className="btn-link" onClick={() => navigate("/cards")}>
        &larr; Back to cards
      </button>
    </div>
  );
}
