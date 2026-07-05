/**
 * CardsList — active cards split into two sections: "Annual fee" (sorted by
 * upcoming renewal date, each showing when the fee renews) and "No annual
 * fee" (a plain inventory). Closed cards are hidden by default, greyed out
 * under a "show closed" toggle.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiClientError } from "../api";
import type { CardListItem } from "../../shared/types";
import { feeRenewalCycle } from "../../shared/cycles";
import { addDays, todayInAppTz } from "../../shared/dates";
import { formatCents, formatDate } from "../components/BenefitRow";

/** Next renewal date (window end + 1), or null when no anniversary date is set. */
function renewalDate(card: CardListItem, today: string): string | null {
  const w = feeRenewalCycle(card, today);
  return w ? addDays(w.end, 1) : null;
}

export default function CardsList() {
  const [cards, setCards] = useState<CardListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .listCards(true)
      .then((data) => {
        if (alive) setCards(data);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiClientError ? err.body.error : "Couldn't load cards.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const today = useMemo(() => todayInAppTz(), []);
  const groups = useMemo(() => {
    const active = (cards ?? []).filter((c) => c.status === "active");
    const feeCards = active
      .filter((c) => c.annualFeeCents > 0)
      .map((c) => ({ card: c, renews: renewalDate(c, today) }))
      // Soonest renewal first; cards without a date sort to the bottom.
      .sort((a, b) => {
        if (a.renews === b.renews) return 0;
        if (a.renews === null) return 1;
        if (b.renews === null) return -1;
        return a.renews < b.renews ? -1 : 1;
      });
    const noFeeCards = active.filter((c) => c.annualFeeCents === 0);
    const closedCards = (cards ?? []).filter((c) => c.status === "closed");
    return { feeCards, noFeeCards, closedCards };
  }, [cards, today]);

  if (error) {
    return <p className="state-message state-message-error">{error}</p>;
  }
  if (!cards) {
    return <p className="state-message">Loading cards…</p>;
  }

  const { feeCards, noFeeCards, closedCards } = groups;
  const hasAny = feeCards.length > 0 || noFeeCards.length > 0 || closedCards.length > 0;

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">Cards</h1>
        <Link to="/cards/new" className="btn btn-primary btn-sm">
          Add card
        </Link>
      </div>

      {closedCards.length > 0 && (
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Show closed cards
        </label>
      )}

      {!hasAny ? (
        <p className="state-message">
          No cards yet — add your first card to start tracking benefits.
        </p>
      ) : (
        <>
          {feeCards.length > 0 && (
            <section className="card-group">
              <h2 className="card-group-title">Annual fee</h2>
              <div className="card-list">
                {feeCards.map(({ card, renews }) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    subtitle={
                      renews
                        ? `${formatCents(card.annualFeeCents)} fee · renews ${formatDate(renews)}`
                        : `${formatCents(card.annualFeeCents)} fee · renewal date not set`
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {noFeeCards.length > 0 && (
            <section className="card-group">
              <h2 className="card-group-title">No annual fee</h2>
              <div className="card-list">
                {noFeeCards.map((card) => (
                  <CardRow key={card.id} card={card} subtitle="No annual fee" />
                ))}
              </div>
            </section>
          )}

          {showClosed && closedCards.length > 0 && (
            <section className="card-group">
              <h2 className="card-group-title">Closed</h2>
              <div className="card-list">
                {closedCards.map((card) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    subtitle={`${formatCents(card.annualFeeCents)} fee`}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CardRow({ card, subtitle }: { card: CardListItem; subtitle: string }) {
  return (
    <Link
      to={`/cards/${card.id}`}
      className={`card-item${card.status === "closed" ? " card-item-closed" : ""}`}
    >
      <div className="card-item-main">
        <p className="card-item-name">
          {card.name}
          {card.status === "closed" && <span className="badge badge-closed">closed</span>}
        </p>
        {card.issuer && <p className="benefit-row-subtitle">{card.issuer}</p>}
        <p className="benefit-row-subtitle">{subtitle}</p>
      </div>
      <div className="card-item-badges">
        <span className="badge badge-count">{card.benefitCount} benefits</span>
        <span className="badge badge-count badge-unused">{card.unusedCount} unused</span>
      </div>
    </Link>
  );
}
