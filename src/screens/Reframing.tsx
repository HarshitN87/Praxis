import { useEffect, useState } from 'react';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import {
  Card,
  Empty,
  Field,
  Notice,
  PillGroup,
  ScreenHead,
  Section,
  TextField,
} from '../components/ui';
import {
  CRISIS_RESOURCES,
  NOT_A_MEDICAL_TOOL,
  assignReframeCondition,
  pickReframe,
} from '../domain/randomise';
import { nowInstant } from '../domain/dates';
import type { ReframingLog } from '../domain/types';

/**
 * Expectation reframing (§4.5, Robson).
 *
 * F28 — the condition is randomised, so the module can actually be
 * validated. The v2.0 schema had `reframe_shown TEXT NOT NULL`, meaning
 * every entry got a reframe and there was no control arm at all, which made
 * its own validation metric incapable of validating it.
 *
 * F29 — there is no distress detection. Crisis resources are shown here
 * unconditionally and are not dismissible, and the switch to stop seeing
 * reframing prompts is manual, visible and reversible. An unreliable keyword
 * classifier that silently alters the UI is worse than nothing, because it
 * implies something is watching when nothing is.
 */
export default function Reframing() {
  const { settings } = useStore();
  const [logs, setLogs] = useState<ReframingLog[]>([]);
  const [starting, setStarting] = useState(false);

  const load = async () => setLogs(await repo.listReframingLogs());
  useEffect(() => {
    void load();
  }, []);

  const pending = logs.filter((l) => l.actualDifficulty === null);

  if (!settings.modules.reframing) {
    return (
      <>
        <Empty
          title="Reframing is off"
          body="You turned this module off. It can be switched back on in Settings at any time."
        />
        <CrisisFooter />
      </>
    );
  }

  return (
    <>
      <ScreenHead
        title="Before a hard task"
        sub="Predict how hard it will be, then record how hard it was"
      />

      {pending.length > 0 ? (
        <Section title="Waiting on the second half">
          <div className="stack">
            {pending.map((l) => (
              <AfterCard key={l.id} log={l} onDone={load} />
            ))}
          </div>
        </Section>
      ) : null}

      {starting ? (
        <BeforeCard
          onDone={async () => {
            setStarting(false);
            await load();
          }}
          onCancel={() => setStarting(false)}
        />
      ) : (
        <button
          type="button"
          className="btn primary block"
          style={{ marginTop: 16 }}
          onClick={() => setStarting(true)}
        >
          I'm about to start something hard
        </button>
      )}

      {logs.filter((l) => l.actualDifficulty !== null).length > 0 ? (
        <Section title="Past entries">
          <div className="stack">
            {logs
              .filter((l) => l.actualDifficulty !== null)
              .slice(0, 30)
              .map((l) => (
                <Card key={l.id}>
                  <div className="row-between">
                    <div className="grow">
                      <div className="card-title">{l.taskDescription}</div>
                      <div className="card-meta">
                        Expected {l.predictedDifficulty}/10 · was {l.actualDifficulty}/10
                        {l.reframeCondition === 'control' ? ' · no prompt shown' : ''}
                      </div>
                    </div>
                    <span className="mono">
                      {(l.actualDifficulty! - l.predictedDifficulty) > 0 ? '+' : ''}
                      {l.actualDifficulty! - l.predictedDifficulty}
                    </span>
                  </div>
                </Card>
              ))}
          </div>
        </Section>
      ) : null}

      <Notice kind="plain" title="Why some entries get no prompt">
        Praxis flips a coin. Without entries where nothing was shown, there is no way to tell
        whether a reframe helped or whether you were simply bad at predicting difficulty that
        week. Both arms are needed for the comparison on the calibration screen to mean anything.
      </Notice>

      <CrisisFooter />
    </>
  );
}

function BeforeCard({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [task, setTask] = useState('');
  const [predicted, setPredicted] = useState<number | null>(null);
  const [condition] = useState(assignReframeCondition);
  const [reframe] = useState(pickReframe);
  const [shown, setShown] = useState(false);

  if (shown) {
    return (
      <Card className="stack">
        {condition === 'reframe' ? (
          <>
            <span className="label">Before you start</span>
            <p className="prose" style={{ fontSize: 18 }}>
              {reframe}
            </p>
          </>
        ) : (
          <p className="prose" style={{ marginTop: 0 }}>
            Recorded. Go and do it — come back afterwards and say how it actually went.
          </p>
        )}
        <button type="button" className="btn primary" onClick={onDone}>
          Done
        </button>
      </Card>
    );
  }

  return (
    <Card className="stack">
      <Field label="What are you about to do?">
        <TextField value={task} onChange={setTask} placeholder="Write the first draft" autoFocus />
      </Field>
      <Field label="How hard do you expect it to be? (1 easy — 10 brutal)">
        <PillGroup
          options={Array.from({ length: 10 }, (_, i) => ({
            value: String(i + 1),
            label: String(i + 1),
          }))}
          value={predicted === null ? null : String(predicted)}
          onChange={(v) => setPredicted(Number(v))}
        />
      </Field>
      <div className="btn-row end">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!task.trim() || predicted === null}
          onClick={async () => {
            await repo.saveReframingLog({
              taskDescription: task.trim(),
              predictedDifficulty: predicted!,
              reframeCondition: condition,
              reframeShown: condition === 'reframe' ? reframe : null,
              actualDifficulty: null,
              loggedBeforeTaskAt: nowInstant(),
              loggedAfterTaskAt: null,
            });
            setShown(true);
          }}
        >
          Record
        </button>
      </div>
    </Card>
  );
}

function AfterCard({ log, onDone }: { log: ReframingLog; onDone: () => Promise<void> }) {
  const [actual, setActual] = useState<number | null>(null);
  return (
    <Card>
      <div className="card-title">{log.taskDescription}</div>
      <div className="card-meta">You expected {log.predictedDifficulty}/10</div>
      <div style={{ marginTop: 12 }}>
        <span className="label">How hard was it really?</span>
        <PillGroup
          options={Array.from({ length: 10 }, (_, i) => ({
            value: String(i + 1),
            label: String(i + 1),
          }))}
          value={actual === null ? null : String(actual)}
          onChange={async (v) => {
            setActual(Number(v));
            await repo.saveReframingLog({
              ...log,
              actualDifficulty: Number(v),
              loggedAfterTaskAt: nowInstant(),
            });
            await onDone();
          }}
        />
      </div>
    </Card>
  );
}

/** Always present, never dismissible, never conditional on any detection. */
export function CrisisFooter() {
  return (
    <div className="crisis">
      <strong>If you need to talk to someone.</strong>
      <div style={{ marginTop: 6 }}>
        {CRISIS_RESOURCES.map((r) => (
          <div key={`${r.region}-${r.name}`}>
            {r.region} — {r.name}: <span className="mono">{r.detail}</span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 10, marginBottom: 0 }}>{NOT_A_MEDICAL_TOOL}</p>
    </div>
  );
}
