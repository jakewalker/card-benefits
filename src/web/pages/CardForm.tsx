/**
 * CardForm — handles both `/cards/new` (create, with "Describe it" / "Manual"
 * tabs) and `/cards/:id/edit` (edit, card fields only) based on the presence
 * of a route `id` param.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api";
import type {
  BenefitInput,
  Card,
  CardInput,
  ImportPayload,
  ParsedCardsPayload,
} from "../../shared/types";
import ParseReview from "../components/ParseReview";
import BenefitEditor, { type BenefitDraft } from "../components/BenefitEditor";

const BLANK_BENEFIT: BenefitDraft = {
  name: "",
  description: null,
  valueCents: null,
  frequency: "monthly",
  anchor: "calendar",
  category: "other",
  automatic: false,
};

interface CardFormFields {
  name: string;
  issuer: string;
  annualFeeDollars: string;
  anniversaryDate: string;
}

const BLANK_FIELDS: CardFormFields = {
  name: "",
  issuer: "",
  annualFeeDollars: "",
  anniversaryDate: "",
};

function fieldsToInput(fields: CardFormFields): CardInput {
  const dollars = Number(fields.annualFeeDollars);
  return {
    name: fields.name.trim(),
    issuer: fields.issuer.trim() ? fields.issuer.trim() : null,
    annualFeeCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0,
    anniversaryDate: fields.anniversaryDate,
  };
}

function cardToFields(card: Card): CardFormFields {
  return {
    name: card.name,
    issuer: card.issuer ?? "",
    annualFeeDollars: (card.annualFeeCents / 100).toString(),
    anniversaryDate: card.anniversaryDate,
  };
}

function stripConfidence(draft: BenefitDraft): BenefitInput {
  const { confidence: _confidence, ...rest } = draft;
  return rest;
}

export default function CardForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [fields, setFields] = useState<CardFormFields>(BLANK_FIELDS);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // create-mode only
  const [tab, setTab] = useState<"describe" | "manual">("describe");
  const [describeText, setDescribeText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCardsPayload | null>(null);
  const [parseIndex, setParseIndex] = useState(0);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [manualBenefits, setManualBenefits] = useState<BenefitDraft[]>([BLANK_BENEFIT]);

  useEffect(() => {
    if (!isEdit || !id) return;
    let alive = true;
    api
      .getCard(id)
      .then((data) => {
        if (alive) setFields(cardToFields(data.card));
      })
      .catch((err) => {
        if (!alive) return;
        setLoadError(err instanceof ApiClientError ? err.body.error : "Couldn't load this card.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, isEdit]);

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateCard(id, fieldsToInput(fields));
      navigate(`/cards/${id}`);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.body.error : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleParse(e: FormEvent) {
    e.preventDefault();
    setParsing(true);
    setParseError(null);
    try {
      const result = await api.parseText(describeText);
      setParsed(result);
      setParseIndex(0);
      setImportedIds([]);
    } catch (err) {
      setParseError(err instanceof ApiClientError ? err.body.error : "Couldn't parse that text.");
    } finally {
      setParsing(false);
    }
  }

  /** After importing/skipping card `i`, move on — or leave when it was the last. */
  function advanceParse(nextImportedIds: string[]) {
    const total = parsed?.cards.length ?? 0;
    if (parseIndex + 1 < total) {
      setImportedIds(nextImportedIds);
      setParseIndex(parseIndex + 1);
      return;
    }
    // Done with every card.
    if (nextImportedIds.length === 1) {
      navigate(`/cards/${nextImportedIds[0]}`);
    } else if (nextImportedIds.length > 1) {
      navigate("/cards");
    } else {
      setParsed(null); // nothing imported — back to the textarea
    }
  }

  async function handleImport(payload: ImportPayload) {
    const result = await api.importCard(payload);
    advanceParse([...importedIds, result.card.id]);
  }

  function handleSkip() {
    advanceParse(importedIds);
  }

  function handleCancelParse() {
    setParsed(null);
    setParseIndex(0);
    setImportedIds([]);
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const payload: ImportPayload = {
        card: fieldsToInput(fields),
        benefits: manualBenefits
          .filter((b) => b.name.trim().length > 0)
          .map(stripConfidence),
      };
      const result = await api.importCard(payload);
      navigate(`/cards/${result.card.id}`);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.body.error : "Couldn't create the card.");
    } finally {
      setSaving(false);
    }
  }

  function updateManualBenefit(index: number, value: BenefitDraft) {
    setManualBenefits((prev) => prev.map((b, i) => (i === index ? value : b)));
  }
  function removeManualBenefit(index: number) {
    setManualBenefits((prev) => prev.filter((_, i) => i !== index));
  }

  if (isEdit) {
    if (loading) return <p className="state-message">Loading card…</p>;
    if (loadError) return <p className="state-message state-message-error">{loadError}</p>;

    return (
      <div className="page">
        <h1 className="page-title">Edit card</h1>
        <form className="form" onSubmit={handleEditSubmit}>
          <CardFieldsForm fields={fields} onChange={setFields} />
          {saveError && <p className="error-text">{saveError}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Add a card</h1>

      <div className="tabs">
        <button
          type="button"
          className={tab === "describe" ? "tab-button tab-button-active" : "tab-button"}
          onClick={() => setTab("describe")}
        >
          Describe it
        </button>
        <button
          type="button"
          className={tab === "manual" ? "tab-button tab-button-active" : "tab-button"}
          onClick={() => setTab("manual")}
        >
          Manual
        </button>
      </div>

      {tab === "describe" ? (
        parsed ? (
          <>
            {parsed.cards.length > 1 && (
              <div className="parse-stepper">
                <span className="parse-stepper-label">
                  Card {parseIndex + 1} of {parsed.cards.length}
                  {parsed.cards[parseIndex]?.card.name
                    ? ` — ${parsed.cards[parseIndex]!.card.name}`
                    : ""}
                </span>
                <button type="button" className="btn-link" onClick={handleSkip}>
                  Skip this card
                </button>
              </div>
            )}
            {/* key forces a fresh ParseReview per card (it seeds state from `initial`) */}
            <ParseReview
              key={parseIndex}
              initial={parsed.cards[parseIndex]!}
              onImport={handleImport}
              onCancel={handleCancelParse}
            />
          </>
        ) : (
          <form className="form" onSubmit={handleParse}>
            <label className="field">
              <span>Describe the card(s) and their benefits</span>
              <textarea
                value={describeText}
                onChange={(e) => setDescribeText(e.target.value)}
                rows={10}
                placeholder={
                  "Paste the benefits page, or describe it in your own words…\n\n" +
                  "Several cards at once works too — separate them with headings:\n" +
                  "# Amex\n## Platinum\n$200 airline credit each calendar year…\n" +
                  "## Gold\n$10 monthly dining credit…\n# Chase\n## Sapphire Reserve\n…"
                }
                required
              />
            </label>
            {parseError && <p className="error-text">{parseError}</p>}
            <button type="submit" className="btn btn-primary" disabled={parsing}>
              {parsing ? "Parsing…" : "Parse with AI"}
            </button>
          </form>
        )
      ) : (
        <form className="form" onSubmit={handleManualSubmit}>
          <CardFieldsForm fields={fields} onChange={setFields} />

          <h2 className="section-title">Benefits</h2>
          {manualBenefits.map((draft, i) => (
            <BenefitEditor
              key={i}
              value={draft}
              onChange={(v) => updateManualBenefit(i, v)}
              onRemove={manualBenefits.length > 1 ? () => removeManualBenefit(i) : undefined}
            />
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setManualBenefits((prev) => [...prev, BLANK_BENEFIT])}
          >
            Add another benefit
          </button>

          {saveError && <p className="error-text">{saveError}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create card"}
          </button>
        </form>
      )}
    </div>
  );
}

interface CardFieldsFormProps {
  fields: CardFormFields;
  onChange: (fields: CardFormFields) => void;
}

function CardFieldsForm({ fields, onChange }: CardFieldsFormProps) {
  return (
    <>
      <label className="field">
        <span>Card name</span>
        <input
          type="text"
          value={fields.name}
          onChange={(e) => onChange({ ...fields, name: e.target.value })}
          required
        />
      </label>
      <label className="field">
        <span>Issuer</span>
        <input
          type="text"
          value={fields.issuer}
          onChange={(e) => onChange({ ...fields, issuer: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Annual fee ($)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={fields.annualFeeDollars}
          onChange={(e) => onChange({ ...fields, annualFeeDollars: e.target.value })}
          required
        />
      </label>
      <label className="field">
        <span>Anniversary date</span>
        <input
          type="date"
          value={fields.anniversaryDate}
          onChange={(e) => onChange({ ...fields, anniversaryDate: e.target.value })}
          required
        />
      </label>
    </>
  );
}
