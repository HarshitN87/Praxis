import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import IntentionComposer from './IntentionComposer';
import {
  Card,
  Field,
  Modal,
  Notice,
  NumberField,
  ScreenHead,
  Section,
  TextField,
  Tag,
} from '../components/ui';
import { AttainmentBar } from '../components/Charts';
import { formatDateHuman, formatInstantHuman } from '../domain/dates';
import { describeOutcome, isQuantified } from '../domain/resolution';
import { formatProbability } from '../domain/probability';
import { workingForecast } from '../domain/calibration';
import type { FullCommitment } from '../domain/types';

export default function Today() {
  const { all, today, settings, categories, refresh } = useStore();
  const [composing, setComposing] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);

  const todays = useMemo(
    () =>
      all
        .filter((f) => f.commitment.tier === 'intention' && f.commitment.localDate === today)
        .sort((a, b) => a.commitment.createdAt.localeCompare(b.commitment.createdAt)),
    [all, today],
  );

  const open = todays.filter((f) => !f.resolution);
  const done = todays.filter((f) => f.resolution);

  const overdue = useMemo(
    () =>
      all.filter(
        (f) =>
          f.commitment.tier === 'decision' &&
          f.commitment.status === 'open' &&
          f.commitment.reviewDueAt !== null &&
          f.commitment.reviewDueAt <= new Date().toISOString(),
      ),
    [all],
  );

  const atCap = todays.length >= settings.maxIntentionsPerDay;
  const overSoft = todays.length >= settings.softIntentionWarnAt;

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '';

  return (
    <>
      <ScreenHead
        title={formatDateHuman(today, today)}
        sub={
          todays.length === 0
            ? 'Nothing set yet.'
            : `${todays.length} intention${todays.length === 1 ? '' : 's'} · ${done.length} answered`
        }
      />

      {overdue.length > 0 ? (
        <Notice kind="info" title={`${overdue.length} decision${overdue.length === 1 ? '' : 's'} ready to review`}>
          <div className="stack-sm" style={{ marginTop: 8 }}>
            {overdue.map((f) => (
              <Link key={f.commitment.id} to={`/commitment/${f.commitment.id}`}>
                {f.commitment.title}
              </Link>
            ))}
          </div>
        </Notice>
      ) : null}

      {open.length > 0 ? (
        <Section title="Waiting on you">
          <div className="stack">
            {open.map((f) => (
              <IntentionRow
                key={f.commitment.id}
                full={f}
                category={catName(f.commitment.categoryId)}
                onChanged={refresh}
                onVoid={() => setVoiding(f.commitment.id)}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {done.length > 0 ? (
        <Section title="Answered">
          <div className="stack">
            {done.map((f) => (
              <Card key={f.commitment.id}>
                <div className="row-between">
                  <div className="grow">
                    <div className="card-title">{f.commitment.title}</div>
                    <div className="card-meta">
                      {catName(f.commitment.categoryId)} · {describeOutcome(f.commitment, f.resolution!)}
                    </div>
                  </div>
                  <Tag>{formatProbability(workingForecast(f.predictions)?.outcomes[0]?.probability ?? NaN)}</Tag>
                </div>
                {f.resolution!.attainment !== null && isQuantified(f.commitment) ? (
                  <div style={{ marginTop: 10 }}>
                    <AttainmentBar attainment={f.resolution!.attainment} />
                  </div>
                ) : null}
                {f.resolution!.note ? (
                  <p className="hint" style={{ fontFamily: 'var(--serif)' }}>
                    {f.resolution!.note}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {todays.length === 0 ? (
        <Card className="flat" >
          <p className="prose" style={{ marginTop: 0 }}>
            Set one or two things you mean to do today, and say how likely you think each one is.
            Tonight you record what actually happened.
          </p>
          <p className="hint">
            One intention a day is enough to start. The point is the prediction, not the volume.
          </p>
        </Card>
      ) : null}

      <div style={{ marginTop: 24 }}>
        {atCap ? (
          <Notice kind="plain">
            That is {settings.maxIntentionsPerDay} for today — the cap. More intentions do not
            produce better data, they produce abandoned ones.
          </Notice>
        ) : (
          <button type="button" className="btn primary block" onClick={() => setComposing(true)}>
            Set an intention
          </button>
        )}
        {overSoft && !atCap ? (
          <p className="hint">
            Three is usually the point where follow-through starts dropping. Worth noticing before
            adding a fourth.
          </p>
        ) : null}
      </div>

      <Section title="Log something you just did">
        <QuickAction onDone={refresh} />
      </Section>

      {composing ? (
        <Modal title="New intention" onClose={() => setComposing(false)}>
          <IntentionComposer onDone={() => setComposing(false)} onCancel={() => setComposing(false)} />
        </Modal>
      ) : null}

      {voiding ? (
        <VoidModal
          commitmentId={voiding}
          onClose={() => setVoiding(null)}
          onDone={async () => {
            setVoiding(null);
            await refresh();
          }}
        />
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- */
/* One intention, awaiting its answer                                */
/* ---------------------------------------------------------------- */

function IntentionRow({
  full,
  category,
  onChanged,
  onVoid,
}: {
  full: FullCommitment;
  category: string;
  onChanged: () => Promise<void>;
  onVoid: () => void;
}) {
  const c = full.commitment;
  const [actual, setActual] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const p = workingForecast(full.predictions)?.outcomes[0]?.probability ?? NaN;

  const resolve = async (didIt: boolean | null) => {
    setBusy(true);
    await repo.resolveCommitment({
      commitmentId: c.id,
      status: 'resolved',
      didIt,
      actualQuantity: actual,
      note: note.trim() || null,
    });
    await onChanged();
    setBusy(false);
  };

  return (
    <Card>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="card-title">{c.title}</div>
          <div className="card-meta">
            {category}
            {isQuantified(c) ? ` · target ${c.targetQuantity} ${c.targetUnit ?? ''}` : ''}
          </div>
        </div>
        <Tag>you said {formatProbability(p)}</Tag>
      </div>

      <p className="hint" style={{ fontFamily: 'var(--serif)', fontSize: 14 }}>
        {c.resolutionCriterion}
      </p>

      {c.iiWhen || c.iiThen ? (
        <p className="hint">
          Plan: {c.iiWhen}
          {c.iiThen ? `, then ${c.iiThen}` : ''}
          {c.iiIfThen ? ` — ${c.iiIfThen}` : ''}
        </p>
      ) : null}

      <div style={{ marginTop: 14 }} className="stack-sm">
        {isQuantified(c) ? (
          <>
            <Field
              label={`How much did you actually do? (${c.targetUnit ?? 'units'})`}
              hint="Praxis works out whether that met the target. You do not decide that part."
            >
              <NumberField value={actual} onChange={setActual} placeholder={String(c.targetQuantity)} min={0} />
            </Field>
            <TextField value={note} onChange={setNote} placeholder="Note (optional)" />
            <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                disabled={actual === null || busy}
                onClick={() => resolve(null)}
              >
                Record
              </button>
              <button type="button" className="btn ghost" onClick={onVoid}>
                Day didn't happen
              </button>
            </div>
          </>
        ) : (
          <>
            <TextField value={note} onChange={setNote} placeholder="Note (optional)" />
            <div className="btn-row">
              <button type="button" className="btn" disabled={busy} onClick={() => resolve(true)}>
                Did it
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => resolve(false)}>
                Didn't
              </button>
              <button type="button" className="btn ghost" onClick={onVoid}>
                Day didn't happen
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* Voiding — the honest escape hatch (F7)                            */
/* ---------------------------------------------------------------- */

function VoidModal({
  commitmentId,
  onClose,
  onDone,
}: {
  commitmentId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal title="Void this one" onClose={onClose}>
      <p className="prose">
        Use this when the day genuinely did not happen — illness, travel, an emergency. Voided
        intentions are excluded from your rates and counted separately, so being honest here does
        not cost you anything.
      </p>
      <p className="hint">
        It is not for days that just went badly. Those are the data. Skipping them is how a hit
        rate quietly becomes a lie.
      </p>
      <Field label="What happened?">
        <TextField value={reason} onChange={setReason} placeholder="Fever" autoFocus />
      </Field>
      <div className="btn-row end" style={{ marginTop: 16 }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!reason.trim()}
          onClick={async () => {
            await repo.resolveCommitment({
              commitmentId,
              status: 'void',
              voidReason: reason.trim(),
            });
            await onDone();
          }}
        >
          Void
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Zero-friction action log (§6.1)                                   */
/* ---------------------------------------------------------------- */

function QuickAction({ onDone }: { onDone: () => Promise<void> }) {
  const { today } = useStore();
  const [text, setText] = useState('');
  const [discomfort, setDiscomfort] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async () => {
    if (!text.trim() || discomfort === null) return;
    const base = repo.blankCommitment('action', today);
    const c = await repo.saveCommitment({
      ...base,
      title: text.trim(),
      resolutionCriterion: 'Done at the moment of logging.',
      discomfortLevel: discomfort,
    });
    await repo.resolveCommitment({ commitmentId: c.id, status: 'resolved', didIt: true });
    setText('');
    setDiscomfort(null);
    setSaved(formatInstantHuman(new Date().toISOString()));
    await onDone();
  };

  return (
    <Card>
      <TextField
        value={text}
        onChange={setText}
        placeholder="Sent the email I'd been putting off"
      />
      <div style={{ marginTop: 12 }}>
        <span className="label">How uncomfortable was it?</span>
        <div className="pills">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className="pill"
              aria-pressed={discomfort === n}
              onClick={() => setDiscomfort(n)}
              style={{ minWidth: 46 }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="btn-row end" style={{ marginTop: 12 }}>
        {saved ? <span className="muted" style={{ fontSize: 12 }}>Logged {saved}</span> : null}
        <button
          type="button"
          className="btn"
          disabled={!text.trim() || discomfort === null}
          onClick={save}
        >
          Log it
        </button>
      </div>
      <p className="hint">
        No prediction needed here — this is a record of something you already did. You can attach
        a constraint to it later from the Actions screen.
      </p>
    </Card>
  );
}
