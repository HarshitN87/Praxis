import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import {
  Card,
  Empty,
  Field,
  Modal,
  Notice,
  NumberField,
  PillGroup,
  ScreenHead,
  Tag,
  TextField,
} from '../components/ui';
import { MAX_MOVES_PER_SIDE, recommend, sensitivity } from '../domain/game';
import type { GameSketch, PayoffCell, PayoffConfidence } from '../domain/types';
import { formatInstantHuman } from '../domain/dates';

/**
 * Strategic sketch (§4.4, Dixit & Nalebuff).
 *
 * The counterparty's payoff is stored and labelled everywhere as the USER'S
 * BELIEF about them (§1.1). Praxis does not claim to compute anyone else's
 * utility function, and the UI says so at the point of entry rather than in
 * a disclaimer nobody reads.
 */
export default function Sketch() {
  const { settings } = useStore();
  const [sketches, setSketches] = useState<GameSketch[]>([]);
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<GameSketch | null>(null);

  const load = async () => setSketches(await repo.listSketches());
  useEffect(() => {
    void load();
  }, []);

  if (!settings.modules.strategicSketch) {
    return (
      <Empty
        title="Strategic sketch is off"
        body="Turn it back on in Settings. It is the least-used module by design — most situations cannot be reduced to a payoff table, and the authors say so themselves."
      />
    );
  }

  return (
    <>
      <ScreenHead title="Strategic sketch" sub="For the few situations that really are a game" />

      {sketches.length === 0 ? (
        <Empty
          title="Nothing sketched"
          body="Useful when there is one counterparty, a small number of moves each, and the outcome depends on what they do. Most situations are not like this — that is fine."
          action={
            <button type="button" className="btn primary" onClick={() => setComposing(true)}>
              Sketch a situation
            </button>
          }
        />
      ) : (
        <>
          <div className="stack">
            {sketches.map((s) => (
              <Card key={s.id} onClick={() => setOpen(s)}>
                <div className="card-title">{s.scenario}</div>
                <div className="card-meta">
                  {s.gameType} · {s.myMoves.length}×{s.counterpartyMoves.length} ·{' '}
                  {formatInstantHuman(s.createdAt)}
                </div>
                {s.outcomeAssessment ? (
                  <Tag>
                    {s.outcomeAssessment === 'as_sketched' ? 'went as sketched' : 'surprised you'}
                  </Tag>
                ) : null}
              </Card>
            ))}
          </div>
          <button
            type="button"
            className="btn block"
            style={{ marginTop: 16 }}
            onClick={() => setComposing(true)}
          >
            Sketch another
          </button>
        </>
      )}

      {composing ? (
        <SketchComposer
          onClose={() => setComposing(false)}
          onDone={async () => {
            setComposing(false);
            await load();
          }}
        />
      ) : null}

      {open ? (
        <SketchDetail
          sketch={open}
          onClose={() => setOpen(null)}
          onChanged={async () => {
            await load();
            setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- */

function SketchComposer({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState('');
  const [gameType, setGameType] = useState<'sequential' | 'simultaneous'>('simultaneous');
  const [myMoves, setMyMoves] = useState<string[]>(['', '']);
  const [theirMoves, setTheirMoves] = useState<string[]>(['', '']);
  const [payoffs, setPayoffs] = useState<PayoffCell[]>([]);

  const liveMine = myMoves.filter((m) => m.trim());
  const liveTheirs = theirMoves.filter((m) => m.trim());

  const startGrid = () => {
    const cells: PayoffCell[] = [];
    for (const my of liveMine) {
      for (const their of liveTheirs) {
        cells.push({
          myMove: my,
          theirMove: their,
          myPayoff: 0,
          theirPayoffBelief: 0,
          confidence: 'guessed',
        });
      }
    }
    setPayoffs(cells);
    setStep(2);
  };

  const update = (i: number, patch: Partial<PayoffCell>) =>
    setPayoffs((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Modal title="Sketch a situation" onClose={onClose}>
      {step === 0 ? (
        <div className="stack">
          <Field label="What is the situation?">
            <TextField
              value={scenario}
              onChange={setScenario}
              placeholder="Negotiating the start date with my new employer"
              autoFocus
            />
          </Field>
          <Field
            label="Do you move at the same time, or does one of you go first?"
            hint="If you can commit visibly before they choose, that is sequential — and moving first is sometimes worth more than having better options."
          >
            <PillGroup
              options={[
                { value: 'simultaneous', label: 'At the same time' },
                { value: 'sequential', label: 'I go first' },
              ]}
              value={gameType}
              onChange={(v) => setGameType(v as 'sequential' | 'simultaneous')}
            />
          </Field>
          <div className="btn-row end">
            <button
              type="button"
              className="btn primary"
              disabled={!scenario.trim()}
              onClick={() => setStep(1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="stack">
          <Field label={`Your moves (up to ${MAX_MOVES_PER_SIDE})`}>
            <div className="stack-sm">
              {myMoves.map((m, i) => (
                <TextField
                  key={i}
                  value={m}
                  onChange={(v) => setMyMoves((prev) => prev.map((x, j) => (j === i ? v : x)))}
                  placeholder={`Move ${i + 1}`}
                />
              ))}
            </div>
          </Field>
          {myMoves.length < MAX_MOVES_PER_SIDE ? (
            <button type="button" className="btn sm" onClick={() => setMyMoves((m) => [...m, ''])}>
              Add
            </button>
          ) : null}

          <Field label={`Their moves (up to ${MAX_MOVES_PER_SIDE})`}>
            <div className="stack-sm">
              {theirMoves.map((m, i) => (
                <TextField
                  key={i}
                  value={m}
                  onChange={(v) => setTheirMoves((prev) => prev.map((x, j) => (j === i ? v : x)))}
                  placeholder={`Move ${i + 1}`}
                />
              ))}
            </div>
          </Field>
          {theirMoves.length < MAX_MOVES_PER_SIDE ? (
            <button
              type="button"
              className="btn sm"
              onClick={() => setTheirMoves((m) => [...m, ''])}
            >
              Add
            </button>
          ) : null}

          <div className="btn-row end">
            <button type="button" className="btn ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={liveMine.length < 2 || liveTheirs.length < 2}
              onClick={startGrid}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="stack">
          <Notice kind="plain">
            Score each square from your point of view, then say how good you feel about it. Their
            number is <strong>your belief about them</strong> — Praxis never treats it as a fact
            about that person.
          </Notice>

          {payoffs.map((c, i) => (
            <Card key={i}>
              <div className="card-meta" style={{ marginBottom: 8 }}>
                You: {c.myMove} · Them: {c.theirMove}
              </div>
              <div className="row">
                <div className="grow">
                  <span className="label">Worth to you</span>
                  <NumberField value={c.myPayoff} onChange={(v) => update(i, { myPayoff: v ?? 0 })} />
                </div>
                <div className="grow">
                  <span className="label">You believe worth to them</span>
                  <NumberField
                    value={c.theirPayoffBelief}
                    onChange={(v) => update(i, { theirPayoffBelief: v ?? 0 })}
                  />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <span className="label">How solid is that?</span>
                <PillGroup
                  options={[
                    { value: 'known', label: 'Known' },
                    { value: 'estimated', label: 'Estimated' },
                    { value: 'guessed', label: 'Guessed' },
                  ]}
                  value={c.confidence}
                  onChange={(v) => update(i, { confidence: v as PayoffConfidence })}
                />
              </div>
            </Card>
          ))}

          <div className="btn-row end">
            <button type="button" className="btn ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                await repo.saveSketch({
                  scenario: scenario.trim(),
                  gameType,
                  myMoves: liveMine,
                  counterpartyMoves: liveTheirs,
                  payoffs,
                  outcomeAssessment: null,
                  outcomeNote: null,
                });
                await onDone();
              }}
            >
              Save & analyse
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/* ---------------------------------------------------------------- */

function SketchDetail({
  sketch,
  onClose,
  onChanged,
}: {
  sketch: GameSketch;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const rec = useMemo(() => recommend(sketch), [sketch]);
  const sens = useMemo(() => sensitivity(sketch), [sketch]);

  return (
    <Modal title={sketch.scenario} onClose={onClose}>
      <div className="stack">
        <Card>
          <span className="label">Based on your current estimates</span>
          {rec.move ? (
            <div className="stat-value" style={{ fontSize: 22, marginBottom: 6 }}>
              {rec.move}
            </div>
          ) : null}
          <p className="prose" style={{ marginTop: 0, marginBottom: 0, fontSize: 15 }}>
            {rec.explanation}
          </p>
        </Card>

        {rec.elimination.steps.length > 0 ? (
          <Card className="flat">
            <span className="label">Ruled out</span>
            {rec.elimination.steps.map((s, i) => (
              <div key={i} style={{ fontSize: 14, padding: '3px 0' }}>
                {s.side === 'me' ? 'Your' : 'Their'} "{s.move}" — {s.because}.
              </div>
            ))}
          </Card>
        ) : null}

        {rec.induction ? (
          <Card className="flat">
            <span className="label">Working backwards</span>
            {rec.induction.branches.map((b, i) => (
              <div key={i} className="row-between" style={{ padding: '4px 0', fontSize: 14 }}>
                <span>
                  You: {b.myMove} → they: {b.theirBestResponse}
                </span>
                <span className="mono">{b.myPayoff}</span>
              </div>
            ))}
          </Card>
        ) : null}

        {/* F24 — always compute, then show exactly which guess would overturn
            it. A refusal teaches less than a sensitivity list. */}
        {sens.caption ? (
          <Notice kind={sens.anyResultChanging ? 'warn' : 'plain'} title="How much weight this can bear">
            {sens.caption}
          </Notice>
        ) : (
          <Notice kind="plain">
            {Math.round(sens.guessedRatio * 100)}% of these payoffs are guesses, and none of them
            change the answer across the range you might be wrong by.
          </Notice>
        )}

        <Field label="After the fact: was their behaviour close to this?">
          <PillGroup
            options={[
              { value: 'as_sketched', label: 'Roughly as sketched' },
              { value: 'surprise', label: 'A surprise' },
            ]}
            value={sketch.outcomeAssessment}
            onChange={async (v) => {
              await repo.saveSketch({
                ...sketch,
                outcomeAssessment: v as GameSketch['outcomeAssessment'],
              });
              await onChanged();
            }}
          />
        </Field>

        <button
          type="button"
          className="btn danger sm"
          onClick={async () => {
            if (!confirm('Delete this sketch?')) return;
            await repo.deleteSketch(sketch.id);
            await onChanged();
          }}
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}
