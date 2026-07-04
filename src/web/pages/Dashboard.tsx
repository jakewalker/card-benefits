/**
 * Dashboard — "Expiring soon" (urgency-sorted, as delivered by the server)
 * and "This cycle" (grouped by card/category, or flat sorted by expiration)
 * with optimistic tap-to-check.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiClientError } from "../api";
import type { Category, DashboardItem, DashboardPayload } from "../../shared/types";
import { CATEGORY_META, CATEGORY_ORDER } from "../../shared/constants";
import { compareByExpiration } from "../../shared/dashboard";
import BenefitRow from "../components/BenefitRow";
import CommentSheet from "../components/CommentSheet";

type GroupBy = "card" | "category" | "expiration";

interface ItemGroup {
  key: string;
  /** null = flat list, no group heading. */
  title: string | null;
  items: DashboardItem[];
}

function groupByCard(items: DashboardItem[]): ItemGroup[] {
  const order: string[] = [];
  const groups: Record<string, ItemGroup> = {};
  for (const item of items) {
    let group = groups[item.cardId];
    if (!group) {
      group = { key: item.cardId, title: item.cardName, items: [] };
      groups[item.cardId] = group;
      order.push(item.cardId);
    }
    group.items.push(item);
  }
  return order.map((id) => groups[id]!);
}

function groupByCategory(items: DashboardItem[]): ItemGroup[] {
  const byCat = new Map<Category, DashboardItem[]>();
  for (const item of items) {
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }
  return CATEGORY_ORDER.filter((cat) => byCat.has(cat)).map((cat) => ({
    key: cat,
    title: `${CATEGORY_META[cat].icon} ${CATEGORY_META[cat].label}`,
    items: byCat.get(cat)!,
  }));
}

function sortByExpiration(items: DashboardItem[]): ItemGroup[] {
  if (items.length === 0) return [];
  return [
    { key: "expiration", title: null, items: [...items].sort(compareByExpiration) },
  ];
}

function sameItem(a: DashboardItem, b: { benefitId?: string; window: { key: string } }) {
  return a.kind === "benefit" && a.benefitId === b.benefitId && a.window.key === b.window.key;
}

function withEffectiveUsed(
  items: DashboardItem[],
  target: DashboardItem,
  effectiveUsed: boolean,
  explicit: boolean,
): DashboardItem[] {
  return items.map((it) => (sameItem(it, target) ? { ...it, effectiveUsed, explicit } : it));
}

function withComment(
  items: DashboardItem[],
  target: DashboardItem,
  comment: string | null,
): DashboardItem[] {
  return items.map((it) => (sameItem(it, target) ? { ...it, comment } : it));
}

export default function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<DashboardItem | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const stored = localStorage.getItem("dashboard-group-by");
    return stored === "category" || stored === "expiration" ? stored : "card";
  });

  function changeGroupBy(next: GroupBy) {
    setGroupBy(next);
    localStorage.setItem("dashboard-group-by", next);
  }

  useEffect(() => {
    let alive = true;
    api
      .getDashboard()
      .then((data) => {
        if (alive) setPayload(data);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiClientError ? err.body.error : "Couldn't load the dashboard.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleToggle(item: DashboardItem) {
    if (!payload || item.kind !== "benefit" || !item.benefitId) return;
    const key = `${item.benefitId}:${item.window.key}`;
    const nextUsed = !item.effectiveUsed;
    const previous = payload;

    let expiringSoon = withEffectiveUsed(payload.expiringSoon, item, nextUsed, true);
    if (nextUsed) {
      expiringSoon = expiringSoon.filter((it) => !sameItem(it, item));
    }
    const current = withEffectiveUsed(payload.current, item, nextUsed, true);

    setBanner(null);
    setBusyKey(key);
    setPayload({ ...payload, expiringSoon, current });

    try {
      await api.setUsage(item.benefitId, item.window.key, { used: nextUsed });
    } catch {
      setPayload(previous);
      setBanner("Couldn't update — try again.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSaveComment(comment: string | null) {
    if (!payload || !commentTarget || !commentTarget.benefitId) return;
    const previous = payload;
    const next: DashboardPayload = {
      ...payload,
      expiringSoon: withComment(payload.expiringSoon, commentTarget, comment),
      current: withComment(payload.current, commentTarget, comment),
    };
    setPayload(next);
    try {
      await api.setUsage(commentTarget.benefitId, commentTarget.window.key, { comment });
    } catch {
      setPayload(previous);
      setBanner("Couldn't save the comment — try again.");
      throw new Error("save failed");
    }
  }

  async function handleClearCheckState() {
    if (!payload || !commentTarget || !commentTarget.benefitId) return;
    const previous = payload;
    const next: DashboardPayload = {
      ...payload,
      expiringSoon: withEffectiveUsed(
        payload.expiringSoon,
        commentTarget,
        commentTarget.automatic,
        false,
      ),
      current: withEffectiveUsed(
        payload.current,
        commentTarget,
        commentTarget.automatic,
        false,
      ),
    };
    setPayload(next);
    try {
      await api.setUsage(commentTarget.benefitId, commentTarget.window.key, { used: null });
    } catch {
      setPayload(previous);
      setBanner("Couldn't reset — try again.");
      throw new Error("reset failed");
    }
  }

  if (loading) {
    return <p className="state-message">Loading your dashboard…</p>;
  }
  if (error) {
    return <p className="state-message state-message-error">{error}</p>;
  }
  if (!payload) {
    return null;
  }

  const groups =
    groupBy === "category"
      ? groupByCategory(payload.current)
      : groupBy === "expiration"
        ? sortByExpiration(payload.current)
        : groupByCard(payload.current);

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>

      {banner && <p className="banner banner-error">{banner}</p>}

      <section className="section">
        <h2 className="section-title">Expiring soon</h2>
        {payload.expiringSoon.length === 0 ? (
          <p className="state-message state-message-inline">
            Nothing urgent — you're all caught up.
          </p>
        ) : (
          <div className="card-list">
            {payload.expiringSoon.map((item) => (
              <BenefitRow
                key={`${item.kind}-${item.benefitId ?? item.cardId}-${item.window.key}`}
                name={item.name}
                cardName={item.cardName}
                kind={item.kind}
                valueCents={item.valueCents}
                category={item.category}
                daysRemaining={item.daysRemaining}
                effectiveUsed={item.effectiveUsed}
                explicit={item.explicit}
                automatic={item.automatic}
                comment={item.comment}
                windowEnd={item.window.end}
                busy={busyKey === `${item.benefitId}:${item.window.key}`}
                onToggle={item.kind === "benefit" ? () => handleToggle(item) : undefined}
                onOpenComment={item.kind === "benefit" ? () => setCommentTarget(item) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-title-row">
          <h2 className="section-title">This cycle</h2>
          <div className="segmented" role="group" aria-label="Group benefits by">
            <button
              type="button"
              className={groupBy === "card" ? "segment segment-active" : "segment"}
              onClick={() => changeGroupBy("card")}
            >
              By card
            </button>
            <button
              type="button"
              className={groupBy === "category" ? "segment segment-active" : "segment"}
              onClick={() => changeGroupBy("category")}
            >
              By category
            </button>
            <button
              type="button"
              className={groupBy === "expiration" ? "segment segment-active" : "segment"}
              onClick={() => changeGroupBy("expiration")}
            >
              Expiring
            </button>
          </div>
        </div>
        {groups.length === 0 ? (
          <p className="state-message state-message-inline">
            No active benefits yet.{" "}
            <Link to="/cards/new">Add a card</Link> to get started.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="card-group">
              {group.title !== null && (
                <h3 className="card-group-title">{group.title}</h3>
              )}
              <div className="card-list">
                {group.items.map((item) => (
                  <BenefitRow
                    key={`${item.benefitId}-${item.window.key}`}
                    name={item.name}
                    cardName={groupBy !== "card" ? item.cardName : undefined}
                    kind={item.kind}
                    valueCents={item.valueCents}
                    category={groupBy !== "category" ? item.category : undefined}
                    daysRemaining={item.daysRemaining}
                    effectiveUsed={item.effectiveUsed}
                    explicit={item.explicit}
                    automatic={item.automatic}
                    comment={item.comment}
                    busy={busyKey === `${item.benefitId}:${item.window.key}`}
                    onToggle={() => handleToggle(item)}
                    onOpenComment={() => setCommentTarget(item)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <CommentSheet
        open={commentTarget != null}
        itemName={commentTarget?.name ?? ""}
        comment={commentTarget?.comment ?? null}
        explicit={commentTarget?.explicit ?? false}
        onSave={handleSaveComment}
        onClearCheckState={handleClearCheckState}
        onClose={() => setCommentTarget(null)}
      />
    </div>
  );
}
