import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import { Card, Empty, PillGroup, ScreenHead, Tag, TextField } from '../components/ui';
import { formatDateHuman } from '../domain/dates';
import { describeOutcome } from '../domain/resolution';
import { formatProbability } from '../domain/probability';
import { workingForecast } from '../domain/calibration';
import { TIER_LABEL, type Tier } from '../domain/types';

type Filter = 'all' | Tier | 'open' | 'unresolved';

/**
 * F33 — the v2.0 spec had no search, no tags, and no unified list. For
 * "every decision, small to big" — thousands of rows within a year — there
 * was no specified way to retrieve a past entry. One timeline across all
 * three tiers falls out naturally from the unified spine.
 */
export default function Timeline() {
  const { all, today, categories } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((f) => {
        const c = f.commitment;
        if (filter === 'open' && c.status !== 'open') return false;
        if (filter === 'unresolved' && f.resolution?.status !== 'unresolved') return false;
        if ((filter === 'intention' || filter === 'action' || filter === 'decision') && c.tier !== filter)
          return false;
        if (!needle) return true;
        return (
          c.title.toLowerCase().includes(needle) ||
          (c.context ?? '').toLowerCase().includes(needle) ||
          c.resolutionCriterion.toLowerCase().includes(needle) ||
          c.tags.some((t) => t.toLowerCase().includes(needle)) ||
          catName(c.categoryId).toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        const d = b.commitment.localDate.localeCompare(a.commitment.localDate);
        return d !== 0 ? d : b.commitment.createdAt.localeCompare(a.commitment.createdAt);
      });
  }, [all, q, filter, categories]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.commitment.localDate;
      const g = m.get(k);
      if (g) g.push(r);
      else m.set(k, [r]);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <>
      <ScreenHead title="Timeline" sub={`${rows.length} of ${all.length} entries`} />

      <div className="stack">
        <TextField value={q} onChange={setQ} placeholder="Search everything" type="search" />
        <PillGroup
          options={[
            { value: 'all', label: 'All' },
            { value: 'intention', label: 'Intentions' },
            { value: 'action', label: 'Actions' },
            { value: 'decision', label: 'Decisions' },
            { value: 'open', label: 'Open' },
            { value: 'unresolved', label: 'Unanswered' },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />
      </div>

      {rows.length === 0 ? (
        <Empty
          title="Nothing here"
          body={
            all.length === 0
              ? 'Set an intention today and it will appear here tonight.'
              : 'No entries match that filter.'
          }
        />
      ) : null}

      {grouped.map(([date, items]) => (
        <div key={date} style={{ marginTop: 28 }}>
          <span className="label">{formatDateHuman(date, today)}</span>
          <div className="stack">
            {items.map((f) => {
              const c = f.commitment;
              const p = workingForecast(f.predictions)?.outcomes.slice().sort((a, b) => b.probability - a.probability)[0];
              return (
                <Link
                  key={c.id}
                  to={`/commitment/${c.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <Card>
                    <div className="row-between" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <div className="card-title">{c.title}</div>
                        <div className="card-meta">
                          {TIER_LABEL[c.tier]}
                          {catName(c.categoryId) ? ` · ${catName(c.categoryId)}` : ''}
                          {f.resolution ? ` · ${describeOutcome(c, f.resolution)}` : ' · open'}
                        </div>
                      </div>
                      {p ? <Tag>{formatProbability(p.probability)}</Tag> : null}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
