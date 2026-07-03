/**
 * CardsList — every card with fee/anniversary/benefit badges. Closed cards
 * are hidden by default, greyed out under a "show closed" toggle.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiClientError } from "../api";
import type { CardListItem } from "../../shared/types";
import { formatCents, formatDate } from "../components/BenefitRow";

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

  if (error) {
    return <p className="state-message state-message-error">{error}</p>;
  }
  if (!cards) {
    return <p className="state-message">Loading cards…</p>;
  }

  const visible = cards.filter((c) => showClosed || c.status === "active");
  const hasClosed = cards.some((c) => c.status === "closed");

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">Cards</h1>
        <Link to="/cards/new" className="btn btn-primary btn-sm">
          Add card
        </Link>
      </div>

      {hasClosed && (
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Show closed cards
        </label>
      )}

      {visible.length === 0 ? (
        <p className="state-message">
          No cards yet — add your first card to start tracking benefits.
        </p>
      ) : (
        <div className="card-list">
          {visible.map((card) => (
            <Link
              key={card.id}
              to={`/cards/${card.id}`}
              className={`card-item${card.status === "closed" ? " card-item-closed" : ""}`}
            >
              <div className="card-item-main">
                <p className="card-item-name">
                  {card.name}
                  {card.status === "closed" && <span className="badge badge-closed">closed</span>}
                </p>
                {card.issuer && <p className="benefit-row-subtitle">{card.issuer}</p>}
                <p className="benefit-row-subtitle">
                  {formatCents(card.annualFeeCents)} fee · anniversary {formatDate(card.anniversaryDate)}
                </p>
              </div>
              <div className="card-item-badges">
                <span className="badge badge-count">{card.benefitCount} benefits</span>
                <span className="badge badge-count badge-unused">{card.unusedCount} unused</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
