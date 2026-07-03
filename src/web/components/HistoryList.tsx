/**
 * HistoryList — lazily fetches and renders a benefit's past cycles.
 * Self-contained: mount it (e.g. when a CardDetail row is expanded) and it
 * fetches `GET /benefits/:id/history` on its own.
 */
import { useEffect, useState } from "react";
import { api, ApiClientError } from "../api";
import type { HistoryPayload } from "../../shared/types";
import { formatDate } from "./BenefitRow";

export interface HistoryListProps {
  benefitId: string;
  limit?: number;
}

export default function HistoryList({ benefitId, limit }: HistoryListProps) {
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getHistory(benefitId, limit)
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((err) => {
        if (!alive) return;
        setError(
          err instanceof ApiClientError ? err.body.error : "Couldn't load history.",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [benefitId, limit]);

  if (loading) {
    return <p className="state-message state-message-inline">Loading history…</p>;
  }
  if (error) {
    return <p className="error-text">{error}</p>;
  }
  if (!data || data.cycles.length === 0) {
    return <p className="state-message state-message-inline">No past cycles yet.</p>;
  }

  return (
    <ul className="history-list">
      {data.cycles.map((cycle) => (
        <li key={cycle.window.key} className="history-item">
          <span className="history-range">
            {formatDate(cycle.window.start)} – {formatDate(cycle.window.end)}
          </span>
          <span
            className={
              cycle.effectiveUsed
                ? "history-status history-status-used"
                : "history-status history-status-missed"
            }
          >
            {cycle.effectiveUsed ? "Used" : "Missed"}
          </span>
          {cycle.comment && <p className="history-comment">{cycle.comment}</p>}
        </li>
      ))}
    </ul>
  );
}
