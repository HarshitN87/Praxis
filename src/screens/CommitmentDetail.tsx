import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import {
  Card,
  Field,
  Modal,
  Notice,
  PillGroup,
  ScreenHead,
  Section,
  Tag,
  TextArea,
  TextField,
} from '../components/ui';
import { formatProbability } from '../domain/probability';
import { workingForecast } from '../domain/calibration';
import { processChecklist } from '../domain/process';
import { independentJudgmentLock } from '../domain/gates';
import { describeOutcome } from '../domain/resolution';
import { formatDateHuman, formatInstantHuman } from '../domain/dates';
import { REVERSIBILITY_LABEL, TIER_LABEL, type FullCommitment } from '../domain/types';

export default function CommitmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { today, categories, refresh } = useStore();
  const [full, setFull] = useState<FullCommitment | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setFull(await repo.getFull(id));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <p className="muted">Loading…</p>;
  if (!full) return <p className="muted">Not found.</p>;

  const c = full.commitment;
  const category = categories.find((x) => x.id === c.categoryId)?.name;
  const working = workingForecast(full.predictions);
  const chosen = full.options.find((o) => o.id === c.chosenOptionId);

  return (
    <>
      <ScreenHead
        title={c.title}
        sub={
          <>
            {TIER_LABEL[c.tier]}
            {category ? ` · ${category}` : ''} · {formatDateHuman(c.localDate, today)}
          </>
        }
        right={
          <button type="button" className="btn ghost sm" onClick={() => navigate(-1)}>
            Back
          </button>
        }
      />

      {c.context ? (
        <Card className="flat">
          <p className="prose" style={{ margin: 0 }}>
            {c.context}
          </p>
        </Card>
      ) : null}

      <Section title="What you said">
        <Card>
          {c.reversibility ? (
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="stat-label">Reversibility</span>
              <span>{REVERSIBILITY_LABEL[c.reversibility]}</span>
            </div>
          ) : null}
          {chosen ? (
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="stat-label">You chose</span>
              <span>{chosen.label}</span>
            </div>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <span className="label">You will judge it by</span>
            <p className="prose" style={{ marginTop: 0, fontSize: 15 }}>
              {c.resolutionCriterion}
            </p>
          </div>
          {c.reviewDueAt ? (
            <div className="card-meta">Review due {formatInstantHuman(c.reviewDueAt)}</div>
          ) : null}
        </Card>
      </Section>

      {working ? (
        <Section title="Your forecast">
          <Card>
            {working.outcomes
              .slice()
              .sort((a, b) => b.probability - a.probability)
              .map((o, i) => (
                <div key={i} className="row-between" style={{ padding: '6px 0' }}>
                  <span>{o.label}</span>
                  <span className="mono">{formatProbability(o.probability)}</span>
                </div>
              ))}
            {working.referenceClass ? (
              <p className="hint">
                Reference class: {working.referenceClass}
                {working.referenceClassRate !== null
                  ? ` (${formatProbability(working.referenceClassRate)})`
                  : ''}
              </p>
            ) : null}
            {full.predictions.length > 1 ? (
              <p className="hint">
                {full.predictions.length} passes recorded. The one scored is the{' '}
                {working.pass === 'averaged' ? 'average of two independent reads' : working.pass}.
              </p>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {full.premortems.length > 0 ? (
        <Section title="How you thought it could fail">
          <div className="stack-sm">
            {full.premortems.map((p) => (
              <Card key={p.id}>
                <p className="prose" style={{ margin: 0, fontSize: 15 }}>
                  {p.failureMechanism}
                </p>
                <div className="row" style={{ marginTop: 8 }}>
                  <Tag>{p.estimatedLikelihood} likelihood</Tag>
                  <Tag>{p.isReversibleIfHit ? 'recoverable' : 'not recoverable'}</Tag>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {c.twoOptionOverrideReason ? (
        <Notice kind="plain" title="You recorded this as genuinely binary">
          {c.twoOptionOverrideReason}
        </Notice>
      ) : null}

      {c.marginOfSafetyNote ? (
        <Section title="Margin of safety">
          <Card className="flat">
            <p className="prose" style={{ margin: 0 }}>
              {c.marginOfSafetyNote}
            </p>
            <div className="card-meta" style={{ marginTop: 8 }}>
              Defined what "enough" looks like: {c.definesEnough ? 'yes' : 'not yet'}
            </div>
          </Card>
        </Section>
      ) : null}

      {c.tier === 'decision' && c.status === 'open' ? (
        <ReopenNotice full={full} />
      ) : null}

      {full.resolution ? (
        <ResolvedView full={full} />
      ) : c.tier === 'decision' ? (
        <ReviewFlow full={full} onDone={async () => {
          await load();
          await refresh();
        }} />
      ) : null}

      {c.tier === 'decision' ? (
        <Section title="Process record">
          <ChecklistView full={full} />
        </Section>
      ) : null}

      <Section>
        <button
          type="button"
          className="btn danger sm"
          onClick={async () => {
            if (!confirm('Delete this entry permanently? It will be removed from every metric.')) return;
            await repo.deleteCommitment(c.id);
            await refresh();
            navigate('/timeline');
          }}
        >
          Delete
        </button>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* The conditional independent-judgment lock (§4.7)                  */
/* ---------------------------------------------------------------- */

function ReopenNotice({ full }: { full: FullCommitment }) {
  const lock = independentJudgmentLock(full.commitment);
  if (!lock.locked) {
    return (
      <Notice kind="plain">
        Still open. You drafted this {Math.round(lock.hoursElapsed)}h ago, so your estimate above
        is shown as you left it — no point pretending to a fresh read this soon.
      </Notice>
    );
  }
  return (
    <Notice kind="info" title="Take a fresh read before you look">
      {lock.reason === 'new_information'
        ? 'You flagged that something changed. '
        : `It has been ${Math.round(lock.hoursElapsed / 24)} days. `}
      Enough time has passed that a genuinely independent second estimate is worth more than
      re-reading your old one.
    </Notice>
  );
}

/* ---------------------------------------------------------------- */
/* Two-stage review (§4.1, corrected per F18)                        */
/* ---------------------------------------------------------------- */

function ReviewFlow({ full, onDone }: { full: FullCommitment; onDone: () => Promise<void> }) {
  const c = full.commitment;
  const [stage, setStage] = useState<1 | 2>(1);
  const [processScore, setProcessScore] = useState<number | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [matched, setMatched] = useState<boolean | null>(null);
  const [resolvedOptionId, setResolvedOptionId] = useState<string | null>(null);
  const [unforeseen, setUnforeseen] = useState(false);
  const [unforeseenText, setUnforeseenText] = useState('');
  const [favorability, setFavorability] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [abandoning, setAbandoning] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await repo.resolveCommitment({
      commitmentId: c.id,
      status: 'resolved',
      resolvedOptionId: unforeseen ? null : resolvedOptionId,
      unforeseenOutcome: unforeseen,
      unforeseenDescription: unforeseen ? unforeseenText.trim() : null,
      outcomeFavorability: favorability,
      processScoreAtReview: processScore,
      processReasoning: reasoning.trim() || null,
      reversibilityMatchedExperience: matched,
      note: note.trim() || null,
    });
    await onDone();
    setSaving(false);
  };

  return (
    <Section title="Review">
      {stage === 1 ? (
        <div className="stack">
          <Notice kind="plain">
            First, the process — judged on its own terms. You already know how this turned out, so
            Praxis also kept the rating you gave at the time
            {c.processScoreAtCommit !== null ? ` (${c.processScoreAtCommit}/5)` : ''}. The gap
            between the two is the interesting part.
          </Notice>

          <Field label="Looking at how you decided — not how it went — how good was the process?">
            <PillGroup
              options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
              value={processScore === null ? null : String(processScore)}
              onChange={(v) => setProcessScore(Number(v))}
            />
          </Field>

          <Field label="Why?">
            <TextArea value={reasoning} onChange={setReasoning} rows={3} />
          </Field>

          <Field label="Did it turn out as reversible as you thought?">
            <PillGroup
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={matched === null ? null : matched ? 'yes' : 'no'}
              onChange={(v) => setMatched(v === 'yes')}
            />
          </Field>

          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={() => setAbandoning(true)}>
              I abandoned this
            </button>
            <button
              type="button"
              className="btn primary grow"
              disabled={processScore === null}
              onClick={() => setStage(2)}
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <Field label="What actually happened?">
            <PillGroup
              options={[
                ...full.options.map((o) => ({ value: o.id, label: o.label })),
                { value: '__none__', label: 'None of these' },
              ]}
              value={unforeseen ? '__none__' : resolvedOptionId}
              onChange={(v) => {
                if (v === '__none__') {
                  setUnforeseen(true);
                  setResolvedOptionId(null);
                } else {
                  setUnforeseen(false);
                  setResolvedOptionId(v);
                }
              }}
            />
          </Field>

          {/* F17 — the outcome not being on the list is the interesting case,
              and the v2.0 schema had no way to record it. */}
          {unforeseen ? (
            <Notice kind="warn" title="Something you had not considered">
              <p style={{ marginTop: 0 }}>
                Every probability you stated was on something that did not happen. That scores
                harshly, which is correct — and it is counted separately as a surprise, because
                the size of your blind spot is worth tracking on its own.
              </p>
              <TextField
                value={unforeseenText}
                onChange={setUnforeseenText}
                placeholder="What happened instead?"
              />
            </Notice>
          ) : null}

          <Field label="How favourable was the outcome?">
            <PillGroup
              options={[
                { value: '-2', label: 'Much worse' },
                { value: '-1', label: 'Worse' },
                { value: '0', label: 'Neutral' },
                { value: '1', label: 'Better' },
                { value: '2', label: 'Much better' },
              ]}
              value={favorability === null ? null : String(favorability)}
              onChange={(v) => setFavorability(Number(v))}
            />
          </Field>

          <Field label="Anything worth remembering?">
            <TextArea value={note} onChange={setNote} rows={3} />
          </Field>

          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={() => setStage(1)}>
              Back
            </button>
            <button
              type="button"
              className="btn primary grow"
              disabled={
                saving ||
                favorability === null ||
                (!unforeseen && !resolvedOptionId) ||
                (unforeseen && !unforeseenText.trim())
              }
              onClick={submit}
            >
              Record outcome
            </button>
          </div>
        </div>
      )}

      {abandoning ? (
        <Modal title="Abandoned" onClose={() => setAbandoning(false)}>
          <p className="prose">
            Abandoning counts as a resolution here, not an exit. You abandon the ones going
            badly — if those quietly left the denominator, your calibration score would be
            computed on survivors only.
          </p>
          <Field label="Why did you abandon it?">
            <TextArea value={note} onChange={setNote} rows={3} />
          </Field>
          <div className="btn-row end" style={{ marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={() => setAbandoning(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!note.trim()}
              onClick={async () => {
                await repo.abandonCommitment(c.id, note.trim());
                setAbandoning(false);
                await onDone();
              }}
            >
              Record
            </button>
          </div>
        </Modal>
      ) : null}
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function ResolvedView({ full }: { full: FullCommitment }) {
  const r = full.resolution!;
  const c = full.commitment;
  const delta =
    c.processScoreAtCommit !== null && r.processScoreAtReview !== null
      ? r.processScoreAtReview - c.processScoreAtCommit
      : null;

  return (
    <Section title="How it went">
      <Card>
        <div className="row-between">
          <span className="stat-label">Outcome</span>
          <span>{describeOutcome(c, r)}</span>
        </div>
        {r.resolvedLabel ? (
          <div className="row-between" style={{ marginTop: 8 }}>
            <span className="stat-label">Resolved as</span>
            <span>{r.resolvedLabel}</span>
          </div>
        ) : null}
        {r.unforeseenOutcome ? (
          <Notice kind="warn" title="Not on your list">
            {r.unforeseenDescription}
          </Notice>
        ) : null}
        {r.note ? (
          <p className="prose" style={{ fontSize: 15, marginBottom: 0 }}>
            {r.note}
          </p>
        ) : null}
      </Card>

      {delta !== null ? (
        <Card className="flat" >
          <span className="label">Process rating</span>
          <div className="row" style={{ gap: 24 }}>
            <div>
              <div className="stat-label">Before you knew</div>
              <div className="stat-value">{c.processScoreAtCommit}/5</div>
            </div>
            <div>
              <div className="stat-label">At review</div>
              <div className="stat-value">{r.processScoreAtReview}/5</div>
            </div>
            <div>
              <div className="stat-label">Shift</div>
              <div className="stat-value">
                {delta > 0 ? '+' : ''}
                {delta}
              </div>
            </div>
          </div>
          <p className="hint">
            A single shift means nothing. Across enough reviews, if good outcomes pull this up and
            bad ones pull it down, that is hindsight rewriting your judgement — and it shows up on
            the calibration screen.
          </p>
        </Card>
      ) : null}
    </Section>
  );
}

function ChecklistView({ full }: { full: FullCommitment }) {
  const items = useMemo(() => processChecklist(full).filter((i) => i.applicable), [full]);
  const done = items.filter((i) => i.done).length;
  return (
    <Card>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <span className="stat-label">Objective process checklist</span>
        <span className="mono">
          {done}/{items.length}
        </span>
      </div>
      {items.map((i) => (
        <div key={i.id} className="row" style={{ padding: '5px 0', alignItems: 'flex-start' }}>
          <span className="mono" style={{ opacity: i.done ? 1 : 0.35, width: 18 }}>
            {i.done ? '✓' : '·'}
          </span>
          <span style={{ fontSize: 14, opacity: i.done ? 1 : 0.6 }}>{i.label}</span>
        </div>
      ))}
      <p className="hint">
        Every item is a fact about the record rather than an opinion about the decision, which is
        exactly why it survives hindsight.
      </p>
    </Card>
  );
}
